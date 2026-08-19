package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/fforchino/vector-go-sdk/pkg/vector"
	"github.com/fforchino/vector-go-sdk/pkg/vectorpb"
)

const audioSampleRate = 16000

type audioResult struct {
	Seconds          float64
	Samples          int
	Peak             int16
	SourceDirection  uint32
	SourceConfidence uint32
}

func recordMicrophones(parent context.Context, robot *vector.Vector, output string, duration time.Duration) (audioResult, error) {
	ctx, cancel := context.WithTimeout(parent, duration+15*time.Second)
	defer cancel()
	stream, err := robot.Conn.AudioFeed(ctx, &vectorpb.AudioFeedRequest{})
	if err != nil {
		return audioResult{}, err
	}
	defer stream.CloseSend()
	targetBytes := int(duration.Seconds() * audioSampleRate * 2)
	pcm := make([]byte, 0, targetBytes+3200)
	result := audioResult{}
	for len(pcm) < targetBytes {
		response, err := stream.Recv()
		if err != nil {
			if len(pcm) >= audioSampleRate*2 {
				break
			}
			return result, err
		}
		pcm = append(pcm, response.GetSignalPower()...)
		result.SourceDirection = response.GetSourceDirection()
		result.SourceConfidence = response.GetSourceConfidence()
	}
	if len(pcm) > targetBytes {
		pcm = pcm[:targetBytes]
	}
	for i := 0; i+1 < len(pcm); i += 2 {
		sample := int16(binary.LittleEndian.Uint16(pcm[i : i+2]))
		magnitude := sample
		if magnitude < 0 {
			magnitude = -magnitude
		}
		if magnitude > result.Peak {
			result.Peak = magnitude
		}
	}
	if err := os.MkdirAll(filepath.Dir(output), 0700); err != nil {
		return result, err
	}
	file, err := os.OpenFile(output, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return result, err
	}
	defer file.Close()
	if err := writeWAV(file, pcm); err != nil {
		return result, err
	}
	result.Samples = len(pcm) / 2
	result.Seconds = float64(result.Samples) / audioSampleRate
	return result, nil
}

func writeWAV(file *os.File, pcm []byte) error {
	dataSize := uint32(len(pcm))
	header := make([]byte, 44)
	copy(header[0:4], "RIFF")
	binary.LittleEndian.PutUint32(header[4:8], 36+dataSize)
	copy(header[8:12], "WAVE")
	copy(header[12:16], "fmt ")
	binary.LittleEndian.PutUint32(header[16:20], 16)
	binary.LittleEndian.PutUint16(header[20:22], 1)
	binary.LittleEndian.PutUint16(header[22:24], 1)
	binary.LittleEndian.PutUint32(header[24:28], audioSampleRate)
	binary.LittleEndian.PutUint32(header[28:32], audioSampleRate*2)
	binary.LittleEndian.PutUint16(header[32:34], 2)
	binary.LittleEndian.PutUint16(header[34:36], 16)
	copy(header[36:40], "data")
	binary.LittleEndian.PutUint32(header[40:44], dataSize)
	if _, err := file.Write(header); err != nil {
		return fmt.Errorf("write WAV header: %w", err)
	}
	if _, err := file.Write(pcm); err != nil {
		return fmt.Errorf("write WAV audio: %w", err)
	}
	return nil
}
