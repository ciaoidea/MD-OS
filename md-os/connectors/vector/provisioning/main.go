package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/digital-dream-labs/vector-bluetooth/ble"
	"golang.org/x/term"
)

func usage() {
	fmt.Println(`vector-cli - local BLE control for Anki Vector

Usage:
  vector-cli scan
  vector-cli connect
  vector-cli status
  vector-cli ip
  vector-cli wifi <ssid>`)
}

func main() {
	if len(os.Args) < 2 {
		usage()
		return
	}
	command := os.Args[1]
	if command != "scan" && command != "connect" && command != "status" && command != "ip" && command != "wifi" {
		usage()
		os.Exit(64)
	}
	if command == "wifi" && len(os.Args) != 3 {
		usage()
		os.Exit(64)
	}

	client, err := ble.New(ble.WithLogDirectory(os.TempDir()))
	if err != nil {
		fmt.Fprintf(os.Stderr, "BLE_INIT_ERROR: %v\n", err)
		os.Exit(1)
	}
	defer client.Close()

	response, err := client.Scan()
	if err != nil {
		fmt.Fprintf(os.Stderr, "BLE_SCAN_ERROR: %v\n", err)
		os.Exit(2)
	}
	if len(response.Devices) == 0 {
		fmt.Println("VECTOR_DEVICES=0")
		return
	}
	targetFilter := strings.TrimSpace(os.Getenv("VECTOR_BLE_NAME"))
	var targetID = -1
	var targetName string
	for _, device := range response.Devices {
		fmt.Printf("VECTOR name=%q id=%d address=%q\n", device.Name, device.ID, device.Address)
		matches := targetFilter == "" && strings.HasPrefix(strings.ToLower(device.Name), "vector ")
		matches = matches || (targetFilter != "" && strings.EqualFold(device.Name, targetFilter))
		if matches && targetID < 0 {
			targetID = device.ID
			targetName = device.Name
		}
	}

	if command == "scan" {
		return
	}
	if targetID < 0 {
		fmt.Fprintf(os.Stderr, "VECTOR_TARGET_NOT_FOUND filter=%q\n", targetFilter)
		os.Exit(3)
	}

	fmt.Printf("CONNECTING name=%q id=%d\n", targetName, targetID)
	if err := client.Connect(targetID); err != nil {
		fmt.Fprintf(os.Stderr, "BLE_CONNECT_ERROR: %v\n", err)
		os.Exit(4)
	}
	fmt.Println("BLE_CONNECTED: read the six-digit PIN on Vector")
	fmt.Print("PIN> ")
	pin, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		fmt.Fprintf(os.Stderr, "PIN_READ_ERROR: %v\n", err)
		os.Exit(5)
	}
	pin = strings.TrimSpace(pin)
	if len([]rune(pin)) != 6 {
		fmt.Fprintln(os.Stderr, "PIN_INVALID: exactly six digits are required")
		os.Exit(6)
	}
	for _, digit := range pin {
		if digit < '0' || digit > '9' {
			fmt.Fprintln(os.Stderr, "PIN_INVALID: exactly six digits are required")
			os.Exit(6)
		}
	}
	if err := client.SendPin(pin); err != nil {
		fmt.Fprintf(os.Stderr, "PIN_EXCHANGE_ERROR: %v\n", err)
		os.Exit(7)
	}
	fmt.Println("BLE_AUTHENTICATED")

	switch command {
	case "connect":
		return
	case "status":
		status, err := client.GetStatus()
		if err != nil {
			fmt.Fprintf(os.Stderr, "STATUS_ERROR: %v\n", err)
			os.Exit(8)
		}
		fmt.Printf("STATUS ssid=%q wifi_state=%d version=%q access_point=%t ota=%t owner=%t cloud_authed=%t\n",
			status.WifiSSID, status.WifiState, status.Version, status.AccessPoint,
			status.OtaInProgress, status.HasOwner, status.CloudAuthed)
		return
	case "ip":
		address, err := client.WifiIP()
		if err != nil {
			fmt.Fprintf(os.Stderr, "IP_ERROR: %v\n", err)
			os.Exit(8)
		}
		fmt.Printf("IP ipv4=%q ipv6=%q\n", address.IPv4, address.IPv6)
		return
	}
	ssid := os.Args[2]
	networks, err := client.WifiScan()
	if err != nil {
		fmt.Fprintf(os.Stderr, "WIFI_SCAN_ERROR: %v\n", err)
		os.Exit(8)
	}
	authType := -1
	for _, network := range networks.Networks {
		if network.WifiSSID == ssid {
			authType = network.AuthType
			break
		}
	}
	if authType < 0 {
		fmt.Fprintf(os.Stderr, "WIFI_NETWORK_NOT_FOUND: %s\n", ssid)
		os.Exit(9)
	}
	fmt.Printf("WIFI_FOUND ssid=%q auth_type=%d\n", ssid, authType)
	fmt.Print("WIFI_PASSWORD> ")
	var password string
	if term.IsTerminal(int(os.Stdin.Fd())) {
		secret, readErr := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Println()
		if readErr != nil {
			fmt.Fprintf(os.Stderr, "WIFI_PASSWORD_READ_ERROR: %v\n", readErr)
			os.Exit(10)
		}
		password = string(secret)
	} else {
		password, err = bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil {
			fmt.Fprintf(os.Stderr, "WIFI_PASSWORD_READ_ERROR: %v\n", err)
			os.Exit(10)
		}
	}
	password = strings.TrimSpace(password)
	result, err := client.WifiConnect(ssid, password, 15, authType)
	password = ""
	if err != nil {
		fmt.Fprintf(os.Stderr, "WIFI_CONNECT_ERROR: %v\n", err)
		os.Exit(11)
	}
	fmt.Printf("WIFI_RESULT ssid=%q state=%d result=%d\n", result.WifiSSID, result.State, result.Result)
}
