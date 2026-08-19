package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	chipperpb "github.com/digital-dream-labs/api/go/chipperpb"
)

const voiceFrames = 80

func (s *podServer) StreamingIntent(stream chipperpb.ChipperGrpc_StreamingIntentServer) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	audio := append([]byte{}, first.GetInputAudio()...)
	frames := 1
	for frames < voiceFrames {
		next, recvErr := stream.Recv()
		if recvErr == io.EOF {
			break
		}
		if recvErr != nil {
			return recvErr
		}
		audio = append(audio, next.GetInputAudio()...)
		frames++
	}
	path, err := s.saveVoice(audio, first.GetAudioEncoding())
	if err != nil {
		return err
	}
	response := &chipperpb.IntentResponse{
		Session: first.GetSession(), DeviceId: first.GetDeviceId(), IsFinal: true,
		IntentResult: &chipperpb.IntentResult{Action: "intent_system_unmatched", IntentConfidence: 1, AllParametersPresent: true},
	}
	if err := stream.Send(response); err != nil {
		return err
	}
	fmt.Printf("VOICE_CAPTURED device=%s frames=%d bytes=%d file=%s\n", first.GetDeviceId(), frames, len(audio), path)
	go s.processVoice(path)
	return nil
}

func (s *podServer) StreamingIntentGraph(stream chipperpb.ChipperGrpc_StreamingIntentGraphServer) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	audio := append([]byte{}, first.GetInputAudio()...)
	frames := 1
	for frames < voiceFrames {
		next, recvErr := stream.Recv()
		if recvErr == io.EOF {
			break
		}
		if recvErr != nil {
			return recvErr
		}
		audio = append(audio, next.GetInputAudio()...)
		frames++
	}
	path, err := s.saveVoice(audio, first.GetAudioEncoding())
	if err != nil {
		return err
	}
	fmt.Printf("VOICE_CAPTURED endpoint=intent-graph device=%s frames=%d bytes=%d file=%s\n", first.GetDeviceId(), frames, len(audio), path)
	response := &chipperpb.IntentGraphResponse{
		Session: first.GetSession(), DeviceId: first.GetDeviceId(), ResponseType: chipperpb.IntentGraphMode_KNOWLEDGE_GRAPH, IsFinal: true,
		IntentResult: &chipperpb.IntentResult{Action: "intent_knowledge_response_extend_bypass"},
		SpokenText:   "Let me think.", CommandType: chipperpb.RobotMode_VOICE_COMMAND.String(),
	}
	if err := stream.Send(response); err != nil {
		return err
	}
	go func() {
		transcript, err := transcribeAudio(path)
		if err != nil {
			fmt.Printf("VOICE_TRANSCRIBE_ERROR error=%q\n", err.Error())
			_ = speakFromProfile(s.path, "I could not understand. Please try again.")
			return
		}
		fmt.Printf("VOICE_TRANSCRIPT text=%q\n", transcript)
		answer, err := answerVoiceQuestion(s.path, transcript)
		if err != nil {
			fmt.Printf("VOICE_CORTEX_ERROR error=%q\n", err.Error())
			return
		}
		if err := speakFromProfile(s.path, answer); err != nil {
			fmt.Printf("VOICE_SPEAK_ERROR error=%q\n", err.Error())
			return
		}
		fmt.Printf("VOICE_DIALOGUE_OK transcript=%q answer=%q\n", transcript, answer)
	}()
	return nil
}

func (s *podServer) TextIntent(ctx context.Context, req *chipperpb.TextRequest) (*chipperpb.IntentResponse, error) {
	return &chipperpb.IntentResponse{IsFinal: true, IntentResult: &chipperpb.IntentResult{Action: "intent_system_unmatched", IntentConfidence: 1, AllParametersPresent: true}}, nil
}

func (s *podServer) StreamingConnectionCheck(stream chipperpb.ChipperGrpc_StreamingConnectionCheckServer) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	frames := uint32(1)
	wanted := first.GetTotalAudioMs() / first.GetAudioPerRequest()
	for frames < wanted {
		if _, err := stream.Recv(); err != nil {
			return err
		}
		frames++
	}
	return stream.Send(&chipperpb.ConnectionCheckResponse{Status: "Success", FramesReceived: frames})
}

func (s *podServer) saveVoice(audio []byte, encoding chipperpb.AudioEncoding) (string, error) {
	runtimeDir, err := privateRuntimeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(runtimeDir, "voice")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	ext := ".pcm"
	if len(audio) > 4 && string(audio[:4]) == "OggS" {
		ext = ".ogg"
	}
	path := filepath.Join(dir, fmt.Sprintf("voice-%d%s", time.Now().UnixMilli(), ext))
	return path, os.WriteFile(path, audio, 0600)
}

func (s *podServer) processVoice(path string) {
	transcript, err := transcribeAudio(path)
	if err != nil {
		fmt.Printf("VOICE_TRANSCRIBE_ERROR error=%q\n", err.Error())
		return
	}
	answer, err := answerVoiceQuestion(s.path, transcript)
	if err != nil {
		fmt.Printf("VOICE_CORTEX_ERROR error=%q\n", err.Error())
		return
	}
	if err := speakFromProfile(s.path, answer); err != nil {
		fmt.Printf("VOICE_SPEAK_ERROR error=%q\n", err.Error())
		return
	}
	fmt.Printf("VOICE_DIALOGUE_OK transcript=%q answer=%q\n", transcript, answer)
}
