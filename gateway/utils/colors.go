package utils

var AnsiColors = []string{
	"\033[91m", // bright red
	"\033[92m", // bright green
	"\033[93m", // bright yellow
	"\033[94m", // bright blue
	"\033[95m", // bright magenta
	"\033[96m", // bright cyan
	"\033[31m", // red
	"\033[32m", // green
	"\033[33m", // yellow
	"\033[34m", // blue
	"\033[35m", // magenta
	"\033[36m", // cyan
}

var AnsiReset = "\033[0m"

func GetColorFromString(str string) string {
	hash := 0

	for i := 0; i < len(str); i++ {
		hash = (hash << 5) - hash + int(str[i])
		hash = hash & 0xFFFFFFFF // ensure 32-bit
	}

	// Use absolute value of hash to select color
	colorIndex := (hash & 0x7FFFFFFF) % len(AnsiColors)
	return AnsiColors[colorIndex]
}
