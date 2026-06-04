{
	"targets": [
		{
			"target_name": "shm_map",
			"sources": ["./main.cpp"],
			"cflags!": ["-fno-exceptions"],
			"cflags_cc!": ["-fno-exceptions"],
			"cflags": [
				"-Os",
				"-fdata-sections",
				"-ffunction-sections",
				"-fno-rtti"
			],
			"cflags_cc": [
				"-Os",
				"-fdata-sections",
				"-ffunction-sections",
				"-fno-rtti"
			],
			"ldflags": [
				"-Wl,--gc-sections",
				"-Wl,--strip-all",
				"-Wl,--as-needed"
			]
		}
	]
}
