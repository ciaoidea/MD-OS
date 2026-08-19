package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"os"
	"path/filepath"
	"time"

	"github.com/fforchino/vector-go-sdk/pkg/vector"
	"github.com/fforchino/vector-go-sdk/pkg/vectorpb"
)

func captureCamera(ctx context.Context, robot *vector.Vector, output string) error {
	release, err := acquireBehaviorControl(ctx, robot)
	if err != nil {
		return err
	}
	defer release()
	response, err := robot.Conn.CaptureSingleImage(ctx, &vectorpb.CaptureSingleImageRequest{EnableHighResolution: true})
	if err != nil {
		return err
	}
	img, _, err := image.Decode(bytes.NewReader(response.GetData()))
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(output), 0700); err != nil {
		return err
	}
	file, err := os.OpenFile(output, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	return jpeg.Encode(file, img, &jpeg.Options{Quality: 95})
}

func captureCameraFromProfile(profilePath string) (string, error) {
	data, err := os.ReadFile(profilePath)
	if err != nil {
		return "", err
	}
	var saved profile
	if err := json.Unmarshal(data, &saved); err != nil {
		return "", err
	}
	robot, err := vector.New(vector.WithTarget(saved.Target), vector.WithToken(saved.GUID))
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	runtimeDir, err := privateRuntimeDir()
	if err != nil {
		return "", err
	}
	output := filepath.Join(runtimeDir, "vision", "latest.jpg")
	if err := captureCamera(ctx, robot, output); err != nil {
		return "", err
	}
	return output, nil
}
