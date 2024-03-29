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

            let result = {}

            const makeRequest = async () => {
                result = {
                    response: null,
                    error: null,
                }

                if (typeof beforeRequest === "function") {
                    await beforeRequest(requestParams)
                }

                if (typeof handleRequestContext === "function") {
                    const context = await handleRequestContext()
                    requestParams = { ...requestParams, ...context }
                }

                return await instance(requestParams)
                    .then((response) => {
                        result.response = response

                        return response
                    })
                    .catch((error) => {
                        result.error = error.response.data.error ?? error.response.data

                        return error
                    })
            }

            const request = await makeRequest()

            if (typeof handleResponse === "function") {
                await handleResponse(request, makeRequest)
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