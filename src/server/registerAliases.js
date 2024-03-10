const moduleAlias = require("module-alias")

export default (fromPath, customAliases = {}) => {
    if (typeof fromPath === "undefined") {
        if (module.parent.filename.includes("dist")) {
            fromPath = path.resolve(process.cwd(), "dist")
        } else {
            fromPath = path.resolve(process.cwd(), "src")
        }
    }

    moduleAlias.addAliases({
        ...customAliases,
        "@controllers": path.resolve(fromPath, "controllers"),
        "@middlewares": path.resolve(fromPath, "middlewares"),
        "@models": path.resolve(fromPath, "models"),
        "@classes": path.resolve(fromPath, "classes"),
        "@lib": path.resolve(fromPath, "lib"),
        "@utils": path.resolve(fromPath, "utils"),
    })
}