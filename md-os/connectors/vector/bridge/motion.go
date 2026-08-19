package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/fforchino/vector-go-sdk/pkg/vector"
	"github.com/fforchino/vector-go-sdk/pkg/vectorpb"
)

var spokenNumber = map[string]float32{
	"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
	"ten": 10, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
	"sixty": 60, "ninety": 90, "one-hundred": 100, "hundred": 100,
}

var spokenMotionPrefix = regexp.MustCompile(`^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?`)
var spokenPunctuation = strings.NewReplacer(",", " ", ".", " ", "!", " ", "?", " ", ":", " ", ";", " ")

const (
	defaultDriveMM = 50
	maxDriveMM     = 200
	defaultTurnDeg = 30
	maxTurnDeg     = 180
)

type motionCommand struct {
	Kind  string  `json:"kind"`
	Value float32 `json:"value"`
}

func parseSpokenMotion(transcript string) (motionCommand, bool) {
	normalized := strings.ToLower(strings.TrimSpace(transcript))
	normalized = spokenPunctuation.Replace(normalized)
	normalized = strings.Join(strings.Fields(normalized), " ")
	normalized = spokenMotionPrefix.ReplaceAllString(normalized, "")
	words := strings.Fields(normalized)
	if len(words) == 0 {
		return motionCommand{}, false
	}
	joined := " " + strings.Join(words, " ") + " "
	kind := ""
	switch {
	case words[0] == "stop" || strings.HasPrefix(normalized, "stop moving"):
		kind = "stop"
	case strings.HasPrefix(normalized, "look up") || strings.HasPrefix(normalized, "move head up") || strings.HasPrefix(normalized, "raise your head"):
		kind = "head-up"
	case strings.HasPrefix(normalized, "look down") || strings.HasPrefix(normalized, "move head down") || strings.HasPrefix(normalized, "lower your head"):
		kind = "head-down"
	case strings.HasPrefix(normalized, "lift up") || strings.HasPrefix(normalized, "raise your lift"):
		kind = "lift-up"
	case strings.HasPrefix(normalized, "lift down") || strings.HasPrefix(normalized, "lower your lift"):
		kind = "lift-down"
	case (words[0] == "move" || words[0] == "go" || words[0] == "drive") && (strings.Contains(joined, " forward ") || strings.Contains(joined, " ahead ")):
		kind = "forward"
	case (words[0] == "move" || words[0] == "go" || words[0] == "drive") && (strings.Contains(joined, " backward ") || strings.Contains(joined, " backwards ") || strings.Contains(joined, " back ")):
		kind = "backward"
	case ((words[0] == "turn" || words[0] == "rotate") || shortDirectionalDegrees(words)) && strings.Contains(joined, " left "):
		kind = "left"
	case ((words[0] == "turn" || words[0] == "rotate") || shortDirectionalDegrees(words)) && strings.Contains(joined, " right "):
		kind = "right"
	default:
		return motionCommand{}, false
	}
	command := motionCommand{Kind: kind}
	if kind == "forward" || kind == "backward" {
		command.Value = spokenAmount(words, defaultDriveMM)
	} else if kind == "left" || kind == "right" {
		command.Value = spokenAmount(words, defaultTurnDeg)
	}
	if validateMotionCommand(command) != nil {
		return motionCommand{}, false
	}
	return command, true
}

func shortDirectionalDegrees(words []string) bool {
	if len(words) < 2 || len(words) > 6 {
		return false
	}
	for _, word := range words {
		if word == "degree" || word == "degrees" {
			return true
		}
	}
	return false
}

func spokenAmount(words []string, fallback float32) float32 {
	for index, word := range words {
		clean := strings.Trim(word, " ,.!?")
		value := float32(0)
		found := false
		if parsed, err := strconv.ParseFloat(clean, 32); err == nil {
			value = float32(parsed)
			found = true
		}
		if named, ok := spokenNumber[clean]; ok {
			value = named
			found = true
		}
		if found {
			if index+1 < len(words) {
				unit := strings.Trim(words[index+1], " ,.!?")
				if unit == "cm" || strings.HasPrefix(unit, "centimeter") || strings.HasPrefix(unit, "centimetre") {
					value *= 10
				}
			}
			return value
		}
	}
	return fallback
}

func spokenMotionFailure(err error) string {
	message := err.Error()
	if strings.Contains(message, "SHOULDNT_DRIVE_ON_CHARGER") || strings.Contains(message, "STILL_ON_CHARGER") {
		return "Please take me off the charger before asking me to drive."
	}
	if strings.Contains(message, "CLIFF") {
		return "I stopped because I detected an unsafe edge."
	}
	if strings.Contains(message, "TRACKS_LOCKED") {
		return "My motors are busy, so I could not move yet."
	}
	return "I could not complete that movement safely."
}

func spokenMotionAcknowledgement(command motionCommand) string {
	switch command.Kind {
	case "forward":
		return fmt.Sprintf("Moving forward %.0f millimeters.", command.Value)
	case "backward":
		return fmt.Sprintf("Moving backward %.0f millimeters.", command.Value)
	case "left":
		return fmt.Sprintf("Turning left %.0f degrees.", command.Value)
	case "right":
		return fmt.Sprintf("Turning right %.0f degrees.", command.Value)
	case "head-up":
		return "Looking up."
	case "head-down":
		return "Looking down."
	case "lift-up":
		return "Raising my lift."
	case "lift-down":
		return "Lowering my lift."
	default:
		return "Stopping."
	}
}

func validateMotionCommand(command motionCommand) error {
	switch command.Kind {
	case "stop", "head-up", "head-down", "lift-up", "lift-down":
		if command.Value != 0 {
			return fmt.Errorf("%s requires a zero value", command.Kind)
		}
	case "forward", "backward":
		if command.Value <= 0 || command.Value > maxDriveMM {
			return fmt.Errorf("drive amount is outside the safe range")
		}
	case "left", "right":
		if command.Value <= 0 || command.Value > maxTurnDeg {
			return fmt.Errorf("turn amount is outside the safe range")
		}
	default:
		return fmt.Errorf("unsupported movement %q", command.Kind)
	}
	return nil
}

func executeMotionFromProfile(command motionCommand) error {
	profilePath, err := privateProfilePath()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(profilePath)
	if err != nil {
		return err
	}
	var saved profile
	if err := json.Unmarshal(data, &saved); err != nil {
		return err
	}
	robot, err := vector.New(vector.WithTarget(saved.Target), vector.WithToken(saved.GUID))
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return executeMotion(ctx, robot, command)
}

func parseMotionCommand(args []string) (motionCommand, error) {
	if len(args) == 0 {
		return motionCommand{}, fmt.Errorf("usage: vector-cortex move <forward|backward|left|right|head-up|head-down|lift-up|lift-down|stop> [amount]")
	}
	kind := args[0]
	switch kind {
	case "stop", "head-up", "head-down", "lift-up", "lift-down":
		if len(args) != 1 {
			return motionCommand{}, fmt.Errorf("%s does not accept an amount", kind)
		}
		return motionCommand{Kind: kind}, nil
	case "forward", "backward":
		value, err := boundedMotionValue(args[1:], defaultDriveMM, maxDriveMM, "millimetres")
		return motionCommand{Kind: kind, Value: value}, err
	case "left", "right":
		value, err := boundedMotionValue(args[1:], defaultTurnDeg, maxTurnDeg, "degrees")
		return motionCommand{Kind: kind, Value: value}, err
	default:
		return motionCommand{}, fmt.Errorf("unknown movement %q", kind)
	}
}

func boundedMotionValue(args []string, fallback, maximum float32, unit string) (float32, error) {
	if len(args) > 1 {
		return 0, fmt.Errorf("expected at most one amount")
	}
	value := fallback
	if len(args) == 1 {
		parsed, err := strconv.ParseFloat(args[0], 32)
		if err != nil {
			return 0, fmt.Errorf("invalid amount %q", args[0])
		}
		value = float32(parsed)
	}
	if value <= 0 || value > maximum {
		return 0, fmt.Errorf("amount must be greater than zero and at most %.0f %s", maximum, unit)
	}
	return value, nil
}

func executeMotion(ctx context.Context, robot *vector.Vector, command motionCommand) error {
	if command.Kind == "stop" {
		_, err := robot.Conn.StopAllMotors(ctx, &vectorpb.StopAllMotorsRequest{})
		return err
	}
	release, err := acquireBehaviorControl(ctx, robot)
	if err != nil {
		return err
	}
	defer release()

	switch command.Kind {
	case "forward", "backward":
		distance := command.Value
		if command.Kind == "backward" {
			distance = -distance
		}
		response, callErr := robot.Conn.DriveStraight(ctx, &vectorpb.DriveStraightRequest{
			SpeedMmps: 50, DistMm: distance, ShouldPlayAnimation: false, IdTag: motionActionID(), NumRetries: 0,
		})
		err = callErr
		if err == nil {
			err = holdAction(ctx, response.GetResult(), time.Duration(command.Value/50*float32(time.Second))+500*time.Millisecond)
		}
	case "left", "right":
		before, beforeErr := currentPoseAngle(ctx, robot)
		if beforeErr != nil {
			return fmt.Errorf("turn pre-readback failed: %w", beforeErr)
		}
		angle := command.Value * math.Pi / 180
		if command.Kind == "right" {
			angle = -angle
		}
		response, callErr := robot.Conn.TurnInPlace(ctx, &vectorpb.TurnInPlaceRequest{
			AngleRad: float32(angle), SpeedRadPerSec: 1, AccelRadPerSec2: 2, TolRad: 0.05, IdTag: motionActionID(), NumRetries: 0,
		})
		err = callErr
		if err == nil {
			err = holdAction(ctx, response.GetResult(), time.Duration(command.Value/57.3*float32(time.Second))+1500*time.Millisecond)
		}
		if err == nil {
			after, readErr := currentPoseAngle(ctx, robot)
			if readErr != nil {
				err = fmt.Errorf("turn post-readback failed: %w", readErr)
			} else {
				observed := normalizedAngleDelta(float64(after - before))
				expected := float64(angle)
				fmt.Printf("MOTION_TURN_READBACK requested_deg=%.1f observed_deg=%.1f before_rad=%.4f after_rad=%.4f\n", command.Value, observed*180/math.Pi, before, after)
				tolerance := math.Max(5*math.Pi/180, math.Abs(expected)*0.20)
				if math.Abs(observed-expected) > tolerance {
					err = fmt.Errorf("turn verification failed: requested %.1f degrees, observed %.1f degrees", expected*180/math.Pi, observed*180/math.Pi)
				}
			}
		}
	case "head-up", "head-down":
		angle := float32(0.6)
		if command.Kind == "head-down" {
			angle = -0.2
		}
		response, callErr := robot.Conn.SetHeadAngle(ctx, &vectorpb.SetHeadAngleRequest{
			AngleRad: angle, MaxSpeedRadPerSec: 1, AccelRadPerSec2: 2, DurationSec: 1, IdTag: motionActionID(), NumRetries: 0,
		})
		err = callErr
		if err == nil {
			err = holdAction(ctx, response.GetResult(), 1200*time.Millisecond)
		}
	case "lift-up", "lift-down":
		height := float32(90)
		if command.Kind == "lift-down" {
			height = 32
		}
		response, callErr := robot.Conn.SetLiftHeight(ctx, &vectorpb.SetLiftHeightRequest{
			HeightMm: height, MaxSpeedRadPerSec: 1.5, AccelRadPerSec2: 3, DurationSec: 1, IdTag: motionActionID(), NumRetries: 0,
		})
		err = callErr
		if err == nil {
			err = holdAction(ctx, response.GetResult(), 1200*time.Millisecond)
		}
	default:
		err = fmt.Errorf("unsupported movement %q", command.Kind)
	}
	return err
}

func normalizedAngleDelta(angle float64) float64 {
	for angle > math.Pi {
		angle -= 2 * math.Pi
	}
	for angle < -math.Pi {
		angle += 2 * math.Pi
	}
	return angle
}

func holdAction(ctx context.Context, result *vectorpb.ActionResult, duration time.Duration) error {
	if result != nil {
		code := result.GetCode()
		if code != vectorpb.ActionResult_ACTION_RESULT_RUNNING && code != vectorpb.ActionResult_ACTION_RESULT_SUCCESS {
			return fmt.Errorf("firmware action failed: %s", code.String())
		}
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func motionActionID() int32 {
	const firstSDKTag int64 = 2000001
	const sdkTagCount int64 = 1000000
	return int32(firstSDKTag + time.Now().UnixMilli()%sdkTagCount)
}
