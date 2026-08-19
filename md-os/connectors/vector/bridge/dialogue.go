package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/fforchino/vector-go-sdk/pkg/vector"
	"github.com/fforchino/vector-go-sdk/pkg/vectorpb"
)

var markdownNoise = regexp.MustCompile(`[\x60*_#>]`)

func announceListening(ctx context.Context, robot *vector.Vector) error {
	release, err := acquireBehaviorControl(ctx, robot)
	if err != nil {
		return err
	}
	defer release()
	_, err = robot.Conn.SayText(ctx, &vectorpb.SayTextRequest{Text: "I am listening.", UseVectorVoice: true, DurationScalar: 1})
	return err
}

func answerRecordedQuestion(ctx context.Context, robot *vector.Vector, audioPath string) (string, string, error) {
	transcript, err := transcribeAudio(audioPath)
	if err != nil {
		return "", "", err
	}
	answer, err := askCortex(transcript)
	if err != nil {
		return transcript, "", err
	}

	release, err := acquireBehaviorControl(ctx, robot)
	if err != nil {
		return transcript, answer, err
	}
	defer release()
	_, err = robot.Conn.SayText(ctx, &vectorpb.SayTextRequest{Text: answer, UseVectorVoice: true, DurationScalar: 1})
	if err != nil {
		return transcript, answer, err
	}
	return transcript, answer, nil
}

func transcribeAudio(audioPath string) (string, error) {
	base := strings.TrimSpace(os.Getenv("CORTEX_VECTOR_INSTALL_DIR"))
	if base == "" {
		executable, err := os.Executable()
		if err != nil {
			return "", fmt.Errorf("resolve installation directory: %w", err)
		}
		base = filepath.Dir(executable)
	}
	python := strings.TrimSpace(os.Getenv("CORTEX_VECTOR_PYTHON"))
	if python == "" {
		dataDir, err := privateDataDir()
		if err != nil {
			return "", err
		}
		python = filepath.Join(dataDir, "stt", "bin", "python")
	}
	transcriber := filepath.Join(base, "transcribe.py")
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, python, transcriber, audioPath)
	dataDir, dataErr := privateDataDir()
	if dataErr != nil {
		return "", dataErr
	}
	command.Env = append(os.Environ(), "HF_HUB_OFFLINE=1", "HF_HOME="+filepath.Join(dataDir, "models"))
	out, err := command.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("transcription failed: %w: %s", err, strings.TrimSpace(string(out)))
	}
	transcript := strings.TrimSpace(string(out))
	if transcript == "" {
		return "", fmt.Errorf("no speech detected")
	}
	return transcript, nil
}

func askCortex(transcript string) (string, error) {
	return askSharedCortex(transcript)
}

func answerVoiceQuestion(profilePath, transcript string) (string, error) {
	if command, ok := parseSpokenMotion(transcript); ok {
		if err := executeMotionFromProfile(command); err != nil {
			fmt.Printf("VOICE_MOTION_ERROR transcript=%q action=%s amount=%.0f error=%q\n", transcript, command.Kind, command.Value, err.Error())
			return spokenMotionFailure(err), nil
		}
		fmt.Printf("VOICE_MOTION_OK transcript=%q action=%s amount=%.0f\n", transcript, command.Kind, command.Value)
		return spokenMotionAcknowledgement(command), nil
	}
	imagePath, err := captureCameraFromProfile(profilePath)
	if err != nil {
		fmt.Printf("VISION_CAPTURE_SKIPPED error=%q\n", err.Error())
		return askCortex(transcript)
	}
	fmt.Printf("VISION_CAPTURED file=%s\n", imagePath)
	return askCortex("[CAMERA] " + transcript)
}

func speakFromProfile(profilePath, answer string) error {
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
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	release, err := acquireBehaviorControl(ctx, robot)
	if err != nil {
		return err
	}
	defer release()
	_, err = robot.Conn.SayText(ctx, &vectorpb.SayTextRequest{Text: answer, UseVectorVoice: true, DurationScalar: 1})
	return err
}

func extractAnswer(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	if index := strings.LastIndex(clean, "AGENT: answer"); index >= 0 {
		clean = strings.TrimSpace(clean[index+len("AGENT: answer"):])
	} else if strings.Contains(clean, "AGENT:") {
		return "", fmt.Errorf("Cortex did not route the voice request as a direct answer")
	}
	clean = markdownNoise.ReplaceAllString(clean, "")
	clean = strings.Join(strings.Fields(clean), " ")
	if clean == "" {
		return "", fmt.Errorf("Cortex returned an empty answer")
	}
	runes := []rune(clean)
	if len(runes) > 450 {
		clean = string(runes[:450])
	}
	return clean, nil
}
