package main

import (
	"strings"
	"testing"
)

func TestVectorGateCreatesMinimalVisibleRequest(t *testing.T) {
	request, err := buildVectorRequest("what time is it?", "[VECTOR-VOICE-123]")
	if err != nil {
		t.Fatal(err)
	}
	if request != "[VECTOR-VOICE-123] what time is it?" {
		t.Fatalf("unexpected visible request: %s", request)
	}
	if strings.Contains(request, "GATE") {
		t.Fatalf("gate preface leaked into visible request: %s", request)
	}
}

func TestSanitizeVectorAnswerRemovesShellMaterial(t *testing.T) {
	answer, err := sanitizeVectorAnswer("AGENT: answer\nIt is 1 PM.\nuser@host:~/workspace$ ")
	if err != nil {
		t.Fatal(err)
	}
	if answer != "It is 1 PM." {
		t.Fatalf("unexpected spoken answer: %q", answer)
	}
}

func TestSanitizeVectorAnswerNormalizesSmartPunctuationForTTS(t *testing.T) {
	answer, err := sanitizeVectorAnswer("It reads, \u201cAn apple a day keeps the doctor away.\u201d")
	if err != nil {
		t.Fatal(err)
	}
	want := `It reads, "An apple a day keeps the doctor away."`
	if answer != want {
		t.Fatalf("got %q, want %q", answer, want)
	}
}
