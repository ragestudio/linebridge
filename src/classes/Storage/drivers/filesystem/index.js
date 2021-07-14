const path = require('path')
const fs = require('fs')

// TODO: Volatile files
// TODO: Redis cache

class FilesystemDriver {
    constructor(params) {
        this.params = { ...params }
        this.rootPath = this.params.root ?? path.resolve(process.cwd(), 'storage')

        this.defaultWriteMode = "0777"
        this.defaultWriteFlags = 'w+'

        this.strictMimetypeCheck = this.strictMimetypeCheck ?? false
        this.checkMimetypes = this.params.checkMimetypes ?? false
        this.mimetypes = String()
        if (Array.isArray(this.params.allowedMimetypes)) {
            this.checkMimetypes = true
            this.params.allowedMimetypes.forEach((type, index) => {
                if (index == 0) {
                    return this.mimetypes = `${type}.*`
                }
                return this.mimetypes = `${this.mimetypes}|${type}.*`
            })
        }

        this.initRootPath()
    }

    initRootPath() {
        // check if root exists
        if (!fs.existsSync(this.rootPath)) {
            fs.mkdirSync(this.rootPath)
        }
    }

    checkMimetype(type) {
        if (!this.checkMimetypes) {
            return true
        }
        return type.match(this.mimetypes)
    }

    stream = (dir, options) => {
        const filePath = path.resolve(this.rootPath, dir ?? "")
        return fs.createWriteStream(filePath, { ...options })
    }

    set = (file, dir, options, callback) => {
        const fileParent = path.resolve(this.rootPath, dir ?? "")
        const filePath = path.join(fileParent, file.name)

        if (!fs.existsSync(fileParent)) {
            fs.mkdirSync(fileParent)
        }

        if (typeof file.mimetype === "undefined" && this.strictMimetypeCheck) {
            throw new Error(`Missing mimetype`)
        }

        if (typeof file.mimetype !== "undefined") {
            const validMIME = this.checkMimetype(file.mimetype) ? true : false

            if (!validMIME && this.strictMimetypeCheck) {
                throw new Error(`Invalid mimetype [${file.mimetype}]`)
            }    
        }
       
        const stream = this.stream(filePath, { mode: options?.mode ?? this.defaultWriteMode, flags: options?.flags ?? this.defaultWriteFlags })

        stream.on("ready", () => {
            stream.write(file.data)
            stream.close()
        })

        stream.on("close", () => {
            if (typeof callback === "function") {
                return callback(fs.lstatSync(filePath))
            }
        })
    }

    setSync = (file, dir, options) => {
        return new Promise((resolve, reject) => {
            try {
                this.set(file, dir, options, (...context) => {
                    return resolve(...context)
                })
            } catch (error) {
                return reject(error)
            }
        })
    }

    // this didnt work with subdirs, only on root (instead use fetch)
    get = (key) => {
        const filePath = path.resolve(this.rootPath, key)

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found`)
        }

        return {
            buffer: fs.readFileSync(filePath),
            stat: fs.lstatSync(filePath)
        }
    }

    getSync = (key) => {
        return new Promise((resolve, reject) => {
            try {
                const file = this.get(key)
                return resolve(file)
            } catch (error) {
                return reject(error)
            }
        })
    }

    fetch = () => {
        // *
    }

    del = () => {
        // *
    }
}

module.exports = FilesystemDriver