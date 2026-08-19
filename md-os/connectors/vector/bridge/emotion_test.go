package main

import "testing"

func TestAnimationForEmotion(t *testing.T) {
	happy, err := animationForEmotion("happy")
	if err != nil || happy != "anim_eyepose_happy" {
		t.Fatalf("happy animation = %q, %v", happy, err)
	}
	for i := 0; i < 20; i++ {
		animation, err := animationForEmotion("negative")
		if err != nil {
			t.Fatal(err)
		}
		if animation != "anim_eyepose_sad" && animation != "anim_eyepose_angry" {
			t.Fatalf("unexpected negative animation %q", animation)
		}
	}
	if _, err := animationForEmotion("unknown"); err == nil {
		t.Fatal("unknown emotion was accepted")
	}
}
