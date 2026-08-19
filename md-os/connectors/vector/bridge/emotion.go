package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"time"

	"github.com/fforchino/vector-go-sdk/pkg/vector"
	"github.com/fforchino/vector-go-sdk/pkg/vectorpb"
)

var negativeEmotionAnimations = []string{"anim_eyepose_sad", "anim_eyepose_angry"}

func animationForEmotion(emotion string) (string, error) {
	switch emotion {
	case "happy":
		return "anim_eyepose_happy", nil
	case "negative":
		choice, err := rand.Int(rand.Reader, big.NewInt(int64(len(negativeEmotionAnimations))))
		if err != nil {
			return "", fmt.Errorf("choose negative expression: %w", err)
		}
		return negativeEmotionAnimations[choice.Int64()], nil
	default:
		return "", fmt.Errorf("unsupported emotion %q", emotion)
	}
}

func executeEmotionFromProfile(emotion string) error {
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
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return executeEmotion(ctx, robot, emotion)
}

func executeEmotion(ctx context.Context, robot *vector.Vector, emotion string) error {
	animation, err := animationForEmotion(emotion)
	if err != nil {
		return err
	}
	release, err := acquireBehaviorControl(ctx, robot)
	if err != nil {
		return err
	}
	defer release()
	response, err := robot.Conn.PlayAnimation(ctx, &vectorpb.PlayAnimationRequest{
		Animation:       &vectorpb.Animation{Name: animation},
		Loops:           3,
		IgnoreBodyTrack: true,
		IgnoreHeadTrack: false,
		IgnoreLiftTrack: true,
	})
	if err != nil {
		return err
	}
	if response.GetResult() != vectorpb.BehaviorResults_BEHAVIOR_COMPLETE_STATE {
		return fmt.Errorf("animation %s returned %s", animation, response.GetResult().String())
	}
	return nil
}
