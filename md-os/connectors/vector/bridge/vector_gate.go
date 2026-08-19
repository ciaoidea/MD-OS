package main

import (
	"fmt"
	"regexp"
	"strings"
)

const maxVectorQuestionRunes = 600
const maxVectorAnswerRunes = 240

var (
	agentHeaderLine = regexp.MustCompile(`(?m)^AGENT: (?:os|code|code\+os|answer)\s*$`)
	terminalLine    = regexp.MustCompile(`(?m)^\S+@\S+:[^\r\n]*[#$] ?$`)
	vectorTTSASCII  = strings.NewReplacer(
		"\u2018", "'", "\u2019", "'",
		"\u201c", "\"", "\u201d", "\"",
		"\u2013", "-", "\u2014", "-",
		"\u2026", "...", "\u00a0", " ",
	)
)

func buildVectorRequest(question, marker string) (string, error) {
	question = strings.TrimSpace(question)
	if question == "" {
		return "", fmt.Errorf("empty spoken question")
	}
	if len([]rune(question)) > maxVectorQuestionRunes {
		return "", fmt.Errorf("spoken question exceeds %d characters", maxVectorQuestionRunes)
	}
	return fmt.Sprintf("%s %s", marker, question), nil
}

func sanitizeVectorAnswer(answer string) (string, error) {
	answer = agentHeaderLine.ReplaceAllString(answer, "")
	answer = terminalLine.ReplaceAllString(answer, "")
	answer = markdownNoise.ReplaceAllString(answer, "")
	answer = vectorTTSASCII.Replace(answer)
	answer = strings.Join(strings.Fields(answer), " ")
	answer = strings.TrimSpace(answer)
	if answer == "" {
		return "", fmt.Errorf("Cortex returned no speakable answer")
	}
	runes := []rune(answer)
	if len(runes) > maxVectorAnswerRunes {
		answer = strings.TrimSpace(string(runes[:maxVectorAnswerRunes]))
	}
	return answer, nil
}
