package main

import (
	"fmt"
	"math"
	"testing"
)

func TestParseMotionCommandDefaultsAndDirections(t *testing.T) {
	tests := []struct {
		args  []string
		kind  string
		value float32
	}{
		{[]string{"forward"}, "forward", 50},
		{[]string{"backward", "75"}, "backward", 75},
		{[]string{"left"}, "left", 30},
		{[]string{"right", "90"}, "right", 90},
		{[]string{"head-up"}, "head-up", 0},
		{[]string{"lift-down"}, "lift-down", 0},
		{[]string{"stop"}, "stop", 0},
	}
	for _, test := range tests {
		got, err := parseMotionCommand(test.args)
		if err != nil {
			t.Fatalf("parse %v: %v", test.args, err)
		}
		if got.Kind != test.kind || got.Value != test.value {
			t.Fatalf("parse %v = %+v", test.args, got)
		}
	}
}

func TestParseMotionCommandRejectsUnsafeAmounts(t *testing.T) {
	for _, args := range [][]string{{"forward", "0"}, {"forward", "201"}, {"left", "181"}, {"right", "fast"}, {"stop", "1"}, {"unknown"}} {
		if _, err := parseMotionCommand(args); err == nil {
			t.Fatalf("expected %v to fail", args)
		}
	}
}

func TestMotionActionIDIsInFirmwareSDKRange(t *testing.T) {
	id := motionActionID()
	if id < 2000001 || id > 3000000 {
		t.Fatalf("action id %d is outside the Vector SDK range", id)
	}
}

func TestValidateMotionCommandRejectsModelOutputOutsideEnvelope(t *testing.T) {
	valid := []motionCommand{{Kind: "forward", Value: 30}, {Kind: "left", Value: 90}, {Kind: "head-up", Value: 0}, {Kind: "stop", Value: 0}}
	for _, command := range valid {
		if err := validateMotionCommand(command); err != nil {
			t.Fatalf("valid command %+v rejected: %v", command, err)
		}
	}
	invalid := []motionCommand{{Kind: "forward", Value: 500}, {Kind: "right", Value: -1}, {Kind: "head-up", Value: 1}, {Kind: "dance", Value: 0}}
	for _, command := range invalid {
		if err := validateMotionCommand(command); err == nil {
			t.Fatalf("unsafe command %+v accepted", command)
		}
	}
}

func TestParseSpokenMotionHandlesNaturalDirectCommands(t *testing.T) {
	tests := []struct {
		spoken string
		want   motionCommand
	}{
		{"Move the forward", motionCommand{Kind: "forward", Value: 50}},
		{"Please move forward thirty millimeters", motionCommand{Kind: "forward", Value: 30}},
		{"Move forward 10 cm", motionCommand{Kind: "forward", Value: 100}},
		{"Could you turn right 20 degrees?", motionCommand{Kind: "right", Value: 20}},
		{"Turn left, 25 degrees.", motionCommand{Kind: "left", Value: 25}},
		{"Tarle right, 30 degrees", motionCommand{Kind: "right", Value: 30}},
		{"Darn left, 25 degrees.", motionCommand{Kind: "left", Value: 25}},
		{"Look up", motionCommand{Kind: "head-up", Value: 0}},
		{"Stop moving", motionCommand{Kind: "stop", Value: 0}},
	}
	for _, test := range tests {
		got, ok := parseSpokenMotion(test.spoken)
		if !ok || got != test.want {
			t.Fatalf("parse %q = %+v, %v; want %+v", test.spoken, got, ok, test.want)
		}
	}
}

func TestSpokenMotionFailureExplainsChargerInhibition(t *testing.T) {
	got := spokenMotionFailure(fmt.Errorf("firmware action failed: SHOULDNT_DRIVE_ON_CHARGER"))
	if got != "Please take me off the charger before asking me to drive." {
		t.Fatalf("unexpected charger explanation: %q", got)
	}
}

func TestNormalizedAngleDeltaHandlesPoseWrap(t *testing.T) {
	got := normalizedAngleDelta((-179 - 179) * math.Pi / 180)
	want := 2 * math.Pi / 180
	if math.Abs(got-want) > 0.0001 {
		t.Fatalf("wrapped delta = %f, want %f", got, want)
	}
}

func TestParseSpokenMotionDoesNotMoveForDiscussionOrUnsafeAmount(t *testing.T) {
	for _, spoken := range []string{"What does forward mean?", "Tell me about turning left", "Move forward 500 millimeters", "Move or left, 5 cm"} {
		if command, ok := parseSpokenMotion(spoken); ok {
			t.Fatalf("discussion or unsafe request %q parsed as %+v", spoken, command)
		}
	}
}
