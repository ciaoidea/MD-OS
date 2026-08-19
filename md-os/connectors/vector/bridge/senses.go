package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/fforchino/vector-go-sdk/pkg/vector"
	"github.com/fforchino/vector-go-sdk/pkg/vectorpb"
)

type sensoryReadback struct {
	Time         string  `json:"time"`
	Touched      bool    `json:"back_touched"`
	TouchRaw     uint32  `json:"touch_raw"`
	PickedUp     bool    `json:"picked_up"`
	BeingHeld    bool    `json:"being_held"`
	Moving       bool    `json:"moving"`
	OnCharger    bool    `json:"on_charger"`
	Cliff        bool    `json:"cliff_detected"`
	DistanceMM   uint32  `json:"proximity_mm"`
	FoundObject  bool    `json:"proximity_object"`
	PoseXMM      float32 `json:"pose_x_mm"`
	PoseYMM      float32 `json:"pose_y_mm"`
	PoseAngleRad float32 `json:"pose_angle_rad"`
	HeadRad      float32 `json:"head_angle_rad"`
	LiftMM       float32 `json:"lift_height_mm"`
	AccelX       float32 `json:"accel_x"`
	AccelY       float32 `json:"accel_y"`
	AccelZ       float32 `json:"accel_z"`
	GyroX        float32 `json:"gyro_x"`
	GyroY        float32 `json:"gyro_y"`
	GyroZ        float32 `json:"gyro_z"`
}

func monitorSenses(ctx context.Context, robot *vector.Vector) error {
	stream, err := robot.Conn.EventStream(ctx, &vectorpb.EventRequest{})
	if err != nil {
		return err
	}
	fmt.Println("VECTOR_SENSES_READY touch Vector's back; press Ctrl-C to stop")
	var previous sensoryReadback
	first := true
	for {
		response, err := stream.Recv()
		if err != nil {
			return err
		}
		state := response.GetEvent().GetRobotState()
		if state == nil {
			continue
		}
		current := readSenses(state)
		if first || materiallyChanged(previous, current) {
			encoded, _ := json.Marshal(current)
			fmt.Printf("SENSES %s\n", encoded)
			previous = current
			first = false
		}
	}
}

func currentPoseAngle(ctx context.Context, robot *vector.Vector) (float32, error) {
	readCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	stream, err := robot.Conn.EventStream(readCtx, &vectorpb.EventRequest{})
	if err != nil {
		return 0, err
	}
	for {
		response, err := stream.Recv()
		if err != nil {
			return 0, err
		}
		state := response.GetEvent().GetRobotState()
		if state != nil {
			return state.GetPoseAngleRad(), nil
		}
	}
}

func readSenses(state *vectorpb.RobotState) sensoryReadback {
	status := state.GetStatus()
	touch := state.GetTouchData()
	prox := state.GetProxData()
	pose := state.GetPose()
	accel := state.GetAccel()
	gyro := state.GetGyro()
	result := sensoryReadback{
		Time:         time.Now().Format(time.RFC3339Nano),
		PickedUp:     status&uint32(vectorpb.RobotStatus_ROBOT_STATUS_IS_PICKED_UP) != 0,
		BeingHeld:    status&uint32(vectorpb.RobotStatus_ROBOT_STATUS_IS_BEING_HELD) != 0,
		Moving:       status&uint32(vectorpb.RobotStatus_ROBOT_STATUS_IS_MOVING) != 0,
		OnCharger:    status&uint32(vectorpb.RobotStatus_ROBOT_STATUS_IS_ON_CHARGER) != 0,
		Cliff:        status&uint32(vectorpb.RobotStatus_ROBOT_STATUS_CLIFF_DETECTED) != 0,
		PoseAngleRad: state.GetPoseAngleRad(), HeadRad: state.GetHeadAngleRad(), LiftMM: state.GetLiftHeightMm(),
	}
	if touch != nil {
		result.Touched, result.TouchRaw = touch.GetIsBeingTouched(), touch.GetRawTouchValue()
	}
	if prox != nil {
		result.DistanceMM, result.FoundObject = prox.GetDistanceMm(), prox.GetFoundObject()
	}
	if pose != nil {
		result.PoseXMM, result.PoseYMM = pose.GetX(), pose.GetY()
	}
	if accel != nil {
		result.AccelX, result.AccelY, result.AccelZ = accel.GetX(), accel.GetY(), accel.GetZ()
	}
	if gyro != nil {
		result.GyroX, result.GyroY, result.GyroZ = gyro.GetX(), gyro.GetY(), gyro.GetZ()
	}
	return result
}

func materiallyChanged(a, b sensoryReadback) bool {
	return a.Touched != b.Touched || a.PickedUp != b.PickedUp || a.BeingHeld != b.BeingHeld ||
		a.Moving != b.Moving || a.OnCharger != b.OnCharger || a.Cliff != b.Cliff ||
		diff(float64(a.DistanceMM), float64(b.DistanceMM)) > 20 ||
		diff(float64(a.PoseXMM), float64(b.PoseXMM)) > 5 || diff(float64(a.PoseYMM), float64(b.PoseYMM)) > 5 ||
		diff(float64(a.PoseAngleRad), float64(b.PoseAngleRad)) > .08 ||
		diff(float64(a.HeadRad), float64(b.HeadRad)) > .08 || diff(float64(a.LiftMM), float64(b.LiftMM)) > 3
}

func diff(a, b float64) float64 { return math.Abs(a - b) }
