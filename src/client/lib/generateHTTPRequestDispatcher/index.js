export default function generateHTTPRequestDispatcher({
    instance,
    method,
    route,
    beforeRequest,
    handleRequestContext,
    handleResponse,
}) {
    return function (body, query, options) {
        return new Promise(async (resolve, reject) => {
            let requestParams = {
                parseData: true,
                ...options,
                method: method,
                url: route,
                data: body,
                params: query,
            }

            if (typeof beforeRequest === "function") {
                await beforeRequest(requestParams)
            }

            if (typeof handleRequestContext === "function") {
                const context = await handleRequestContext()
                requestParams = { ...requestParams, ...context }
            }

            let result = {
                response: null,
                error: null,
            }

            const request = await instance(requestParams)
                .then((response) => {
                    result.response = response

                    return response
                })
                .catch((error) => {
                    result.error = error.response.data.error ?? error.response.data

                    return error
                })

            if (typeof handleResponse === "function") {
                await handleResponse(request)
            }

            if (requestParams.parseData) {
                if (result.error) {
                    return reject(result.error)
                }

                return resolve(result.response.data)
            }

            return resolve(result)
        })
    }
}

module.exports = generateHTTPRequestDispatcher