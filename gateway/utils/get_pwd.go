package utils

import "os"

func Pwd() string {
	var dir string = ""

	if len(os.Args) > 1 {
		dir = os.Args[1]
	} else {
		dir, _ = os.Getwd()
	}

	return dir
}
