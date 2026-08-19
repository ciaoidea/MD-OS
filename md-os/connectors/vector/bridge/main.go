package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fforchino/vector-go-sdk/pkg/vector"
	"github.com/fforchino/vector-go-sdk/pkg/vectorpb"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: vector-cortex <serve|probe|say TEXT|senses|camera [FILE]|listen [SECONDS]|ask [SECONDS]|move ACTION [AMOUNT]|emotion STATE|animations>")
		os.Exit(64)
	}
	if os.Args[1] == "serve" {
		if err := runPod(); err != nil {
			fmt.Fprintf(os.Stderr, "SERVER_ERROR: %v\n", err)
			os.Exit(1)
		}
		return
	}
	if os.Args[1] != "probe" && os.Args[1] != "say" && os.Args[1] != "senses" && os.Args[1] != "camera" && os.Args[1] != "listen" && os.Args[1] != "ask" && os.Args[1] != "move" && os.Args[1] != "emotion" && os.Args[1] != "animations" {
		fmt.Fprintln(os.Stderr, "usage: vector-cortex <serve|probe|say TEXT|senses|camera [FILE]|listen [SECONDS]|ask [SECONDS]|move ACTION [AMOUNT]|emotion STATE|animations>")
		os.Exit(64)
	}
	if os.Args[1] == "say" && len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: vector-cortex say TEXT")
		os.Exit(64)
	}

	profilePath, err := privateProfilePath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "PROFILE_ERROR: %v\n", err)
		os.Exit(1)
	}
	profileBytes, err := os.ReadFile(profilePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "PROFILE_ERROR: %v\n", err)
		os.Exit(1)
	}
	var saved profile
	if err := json.Unmarshal(profileBytes, &saved); err != nil {
		fmt.Fprintf(os.Stderr, "PROFILE_ERROR: %v\n", err)
		os.Exit(1)
	}
	robot, err := vector.New(
		vector.WithTarget(saved.Target),
		vector.WithToken(saved.GUID),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "CONNECT_ERROR: %v\n", err)
		os.Exit(1)
	}
	if os.Args[1] == "move" {
		command, err := parseMotionCommand(os.Args[2:])
		if err != nil {
			fmt.Fprintf(os.Stderr, "MOVE_ERROR: %v\n", err)
			os.Exit(64)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := executeMotion(ctx, robot, command); err != nil {
			fmt.Fprintf(os.Stderr, "MOVE_ERROR: %v\n", err)
			os.Exit(2)
		}
		fmt.Printf("VECTOR_MOVE_OK action=%s amount=%.0f\n", command.Kind, command.Value)
		return
	}
	if os.Args[1] == "emotion" {
		if len(os.Args) != 3 {
			fmt.Fprintln(os.Stderr, "usage: vector-cortex emotion <happy|negative>")
			os.Exit(64)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := executeEmotion(ctx, robot, os.Args[2]); err != nil {
			fmt.Fprintf(os.Stderr, "EMOTION_ERROR: %v\n", err)
			os.Exit(2)
		}
		fmt.Printf("VECTOR_EMOTION_OK state=%s\n", os.Args[2])
		return
	}
	if os.Args[1] == "animations" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		response, err := robot.Conn.ListAnimations(ctx, &vectorpb.ListAnimationsRequest{})
		if err != nil {
			fmt.Fprintf(os.Stderr, "ANIMATIONS_ERROR: %v\n", err)
			os.Exit(2)
		}
		for _, animation := range response.GetAnimationNames() {
			fmt.Println(animation.GetName())
		}
		return
	}

	ctx := context.Background()
	var cancel context.CancelFunc
	if os.Args[1] == "senses" {
		ctx, cancel = context.WithCancel(ctx)
	} else if os.Args[1] == "ask" {
		ctx, cancel = context.WithTimeout(ctx, 3*time.Minute)
	} else {
		ctx, cancel = context.WithTimeout(ctx, 60*time.Second)
	}
	defer cancel()
	if os.Args[1] == "senses" {
		if err := monitorSenses(ctx, robot); err != nil {
			fmt.Fprintf(os.Stderr, "SENSES_ERROR: %v\n", err)
			os.Exit(2)
		}
		return
	}
	if os.Args[1] == "camera" {
		runtimeDir, runtimeErr := privateRuntimeDir()
		if runtimeErr != nil {
			fmt.Fprintf(os.Stderr, "RUNTIME_ERROR: %v\n", runtimeErr)
			os.Exit(1)
		}
		output := filepath.Join(runtimeDir, "vision", "manual-camera.jpg")
		if len(os.Args) == 3 {
			output = os.Args[2]
		}
		if err := captureCamera(ctx, robot, output); err != nil {
			fmt.Fprintf(os.Stderr, "CAMERA_ERROR: %v\n", err)
			os.Exit(2)
		}
		fmt.Printf("VECTOR_CAMERA_OK file=%s\n", output)
		return
	}
	if os.Args[1] == "listen" || os.Args[1] == "ask" {
		duration := 5 * time.Second
		if len(os.Args) == 3 {
			parsed, err := time.ParseDuration(os.Args[2] + "s")
			if err != nil || parsed < time.Second || parsed > 60*time.Second {
				fmt.Fprintln(os.Stderr, "LISTEN_ERROR: seconds must be between 1 and 60")
				os.Exit(64)
			}
			duration = parsed
		}
		runtimeDir, runtimeErr := privateRuntimeDir()
		if runtimeErr != nil {
			fmt.Fprintf(os.Stderr, "RUNTIME_ERROR: %v\n", runtimeErr)
			os.Exit(1)
		}
		output := filepath.Join(runtimeDir, "voice", "manual-microphones.wav")
		if os.Args[1] == "ask" {
			if err := announceListening(ctx, robot); err != nil {
				fmt.Fprintf(os.Stderr, "ASK_ERROR: listening announcement failed: %v\n", err)
				os.Exit(2)
			}
			time.Sleep(700 * time.Millisecond)
		}
		result, err := recordMicrophones(ctx, robot, output, duration)
		if err != nil {
			fmt.Fprintf(os.Stderr, "LISTEN_ERROR: %v\n", err)
			os.Exit(2)
		}
		fmt.Printf("VECTOR_LISTEN_OK file=%s seconds=%.1f samples=%d peak=%d source_direction=%d confidence=%d\n", output, result.Seconds, result.Samples, result.Peak, result.SourceDirection, result.SourceConfidence)
		if os.Args[1] == "ask" {
			transcript, answer, err := answerRecordedQuestion(ctx, robot, output)
			if err != nil {
				fmt.Fprintf(os.Stderr, "ASK_ERROR: %v\n", err)
				os.Exit(2)
			}
			fmt.Printf("VECTOR_HEARD %s\n", transcript)
			fmt.Printf("CORTEX_ANSWER %s\n", answer)
		}
		return
	}
	if os.Args[1] == "say" {
		text := strings.Join(os.Args[2:], " ")
		if len([]rune(text)) > 500 {
			fmt.Fprintln(os.Stderr, "SAY_ERROR: text exceeds 500 characters")
			os.Exit(64)
		}
		release, err := acquireBehaviorControl(ctx, robot)
		if err != nil {
			fmt.Fprintf(os.Stderr, "CONTROL_ERROR: %v\n", err)
			os.Exit(2)
		}
		defer release()
		response, err := robot.Conn.SayText(ctx, &vectorpb.SayTextRequest{Text: text, UseVectorVoice: true, DurationScalar: 1})
		if err != nil {
			fmt.Fprintf(os.Stderr, "SAY_ERROR: %v\n", err)
			os.Exit(2)
		}
		fmt.Printf("VECTOR_SAY_OK response=%+v\n", response)
		return
	}
	state, err := robot.Conn.BatteryState(ctx, &vectorpb.BatteryStateRequest{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "PROBE_ERROR: %v\n", err)
		os.Exit(2)
	}
	fmt.Printf("VECTOR_WIFI_OK battery=%+v\n", state)
}

func acquireBehaviorControl(ctx context.Context, robot *vector.Vector) (func(), error) {
	stream, err := robot.Conn.BehaviorControl(ctx)
	if err != nil {
		return nil, err
	}
	request := &vectorpb.BehaviorControlRequest{
		RequestType: &vectorpb.BehaviorControlRequest_ControlRequest{
			ControlRequest: &vectorpb.ControlRequest{Priority: vectorpb.ControlRequest_OVERRIDE_BEHAVIORS},
		},
	}
	if err := stream.Send(request); err != nil {
		return nil, err
	}
	for {
		response, err := stream.Recv()
		if err != nil {
			return nil, err
		}
		if response.GetControlGrantedResponse() != nil {
			break
		}
	}
	return func() {
		_ = stream.Send(&vectorpb.BehaviorControlRequest{
			RequestType: &vectorpb.BehaviorControlRequest_ControlRelease{
				ControlRelease: &vectorpb.ControlRelease{},
			},
		})
		_ = stream.CloseSend()
	}, nil
}
