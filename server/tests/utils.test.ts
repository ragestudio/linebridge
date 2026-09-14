import { describe, it, expect } from "vitest"
import nanoid from "../src/utils/nanoid"
import parsePathParameters from "../src/utils/parsePathParameters"

describe("Utils", () => {
	describe("nanoid", () => {
		it("should generate an ID of default length 21", () => {
			const id = nanoid()
			expect(id).toBeDefined()
			expect(typeof id).toBe("string")
			expect(id.length).toBe(21)
		})

		it("should generate an ID of specified length", () => {
			const id = nanoid(10)
			expect(id.length).toBe(10)

			const longId = nanoid(50)
			expect(longId.length).toBe(50)
		})

		it("should generate unique IDs", () => {
			const id1 = nanoid()
			const id2 = nanoid()
			expect(id1).not.toBe(id2)
		})

		it("should only contain URL-safe characters", () => {
			const id = nanoid(100)
			// URL-safe characters: a-z, A-Z, 0-9, -, _
			expect(id).toMatch(/^[a-zA-Z0-9\-_]+$/)
		})
	})

	describe("parsePathParameters", () => {
		it("should parse a route with no parameters", () => {
			const result = parsePathParameters("/users/all")
			expect(result).toEqual([])
		})

		it("should parse a route with one parameter", () => {
			const result = parsePathParameters("/users/:id")
			expect(result).toEqual([["id", 0]])
		})

		it("should parse a route with multiple parameters", () => {
			const result = parsePathParameters("/users/:userId/posts/:postId")
			expect(result).toEqual([
				["userId", 0],
				["postId", 1],
			])
		})

		it("should ignore segments that are not parameters", () => {
			const result = parsePathParameters(
				"/api/v1/users/:userId/settings/:settingId/details",
			)
			expect(result).toEqual([
				["userId", 0],
				["settingId", 1],
			])
		})

		it("should handle edge cases like just a colon", () => {
			// "current.length >= 2" check means a standalone colon shouldn't be parsed
			const result = parsePathParameters("/users/:")
			expect(result).toEqual([])
		})

		it("should handle empty paths", () => {
			const result = parsePathParameters("")
			expect(result).toEqual([])
		})
	})
})
