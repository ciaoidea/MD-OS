package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var shellPrompt = regexp.MustCompile(`(?m)[#$] $`)

func mdosWorkspace() string {
	if configured := strings.TrimSpace(os.Getenv("MDOS_WORKSPACE")); configured != "" {
		return filepath.Clean(configured)
	}
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	return filepath.Clean(dir)
}

type vectorVoiceReceipt struct {
	RequestID string         `json:"request_id"`
	Response  string         `json:"response"`
	Motion    *motionCommand `json:"motion,omitempty"`
	Emotion   string         `json:"emotion,omitempty"`
}

func sharedSessionName() string {
	sum := sha256.Sum256([]byte(mdosWorkspace()))
	return fmt.Sprintf("cortex-md-os-apfc-%x", sum[:6])
}

func tmuxOutput(ctx context.Context, arguments ...string) (string, error) {
	command := exec.CommandContext(ctx, "tmux", arguments...)
	out, err := command.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("tmux %s failed: %w: %s", arguments[0], err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func captureSharedPane(ctx context.Context, target string) (string, error) {
	return tmuxOutput(ctx, "capture-pane", "-p", "-J", "-S", "-2000", "-t", target)
}

func paneIsIdle(snapshot string) bool {
	return shellPrompt.MatchString(strings.TrimRight(snapshot, "\r\n"))
}

func askSharedCortex(question string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	target := sharedSessionName() + ":0.0"

	for {
		snapshot, err := captureSharedPane(ctx, target)
		if err != nil {
			return "", err
		}
		if paneIsIdle(snapshot) {
			break
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("shared Cortex session remained busy")
		case <-time.After(250 * time.Millisecond):
		}
	}

	marker := fmt.Sprintf("[VECTOR-VOICE-%d]", time.Now().UnixNano())
	request, err := buildVectorRequest(question, marker)
	if err != nil {
		return "", err
	}
	if _, err := tmuxOutput(ctx, "set-buffer", "--", request); err != nil {
		return "", err
	}
	if _, err := tmuxOutput(ctx, "paste-buffer", "-d", "-t", target); err != nil {
		return "", err
	}
	if _, err := tmuxOutput(ctx, "send-keys", "-t", target, "Enter"); err != nil {
		return "", err
	}

	requestID := strings.TrimSuffix(strings.TrimPrefix(marker, "[VECTOR-VOICE-"), "]")
	runtimeDir, err := privateRuntimeDir()
	if err != nil {
		return "", err
	}
	receiptPath := filepath.Join(runtimeDir, "responses", requestID+".json")
	_ = os.Remove(receiptPath)
	for {
		data, readErr := os.ReadFile(receiptPath)
		if readErr == nil {
			var receipt vectorVoiceReceipt
			if err := json.Unmarshal(data, &receipt); err != nil {
				return "", fmt.Errorf("decode Cortex-Vector receipt: %w", err)
			}
			if receipt.RequestID != requestID {
				return "", fmt.Errorf("Cortex-Vector receipt id mismatch")
			}
			_ = os.Remove(receiptPath)
			answer, err := sanitizeVectorAnswer(receipt.Response)
			if err != nil {
				return "", err
			}
			if receipt.Motion != nil {
				if err := validateMotionCommand(*receipt.Motion); err != nil {
					return "I could not move because the requested motion was unsafe.", nil
				}
				if err := executeMotionFromProfile(*receipt.Motion); err != nil {
					return "I could not complete that movement safely.", nil
				}
			}
			if receipt.Emotion != "" {
				if err := executeEmotionFromProfile(receipt.Emotion); err != nil {
					fmt.Printf("VOICE_EMOTION_ERROR emotion=%s error=%q\n", receipt.Emotion, err.Error())
				} else {
					fmt.Printf("VOICE_EMOTION_OK emotion=%s\n", receipt.Emotion)
				}
			}
			return answer, nil
		}
		if !os.IsNotExist(readErr) {
			return "", readErr
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("shared Cortex response timed out")
		case <-time.After(250 * time.Millisecond):
		}
	}
}
