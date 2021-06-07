const path = require('path')

const drivers = {
    "fs": require("./drivers/filesystem"),
    "memfs": require("./drivers/onMemory")
}

// set default allowed file extension
const allowedImages = ["png", "jpg", "tiff", "gif", "svg", "jpeg"]
const allowedFiles = ["zip"]
const allowedAudio = ["wav", "mp3", "ogg", "flac"]
const allowedVideo = ["mp4", "mkv"]

class Storage {
    constructor(params) {
        this.params = { ...params }

        this.type = this.params.type
        this.driver = null

        //
        this.allowedExtensions = [
            ...allowedImages ?? [],
            ...allowedFiles ?? [],
            ...allowedAudio ?? [],
            ...allowedVideo ?? [],
            ...global.allowedExtensions ?? []
        ]
        this.allowedMimetypes = [
            "text",
            "image",
            "application",
            ...global.allowedMimetypes ?? []
        ]

        //
        if (typeof drivers[this.params.driver] !== "undefined") {
            return new drivers[this.params.driver](this)
        } else {
            throw new Error(`Invalid storage driver!`)
        }
    }
}

module.exports = { Storage }