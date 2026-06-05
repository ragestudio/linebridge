/**
 * @file cluster operation: send an event to all sessions of a given user
 *
 * dispatches a "sendToUserId" operation across the cluster. the
 * handling service finds all socket connections for that user and
 * delivers the event to each one, regardless of which gateway they
 * are connected to
 */

import type NatsAdapter from "../adapter"

/**
 * sends an event to every connected session belonging to a user
 *
 * wraps the event and data into the operation payload, then dispatches
 * a "sendToUserId" request. the service that handles it locates all
 * socket_ids for the user and routes the event to each one via the
 * "ipc" subject
 *
 * @param user_id - the authenticated user id to deliver to
 * @param event - the event name to send
 * @param data - optional payload to include with the event
 * @returns the decoded response from the cluster operation
 */
export default async function sendToUserId(
	this: NatsAdapter,
	user_id: string,
	event: string,
	data?: any,
): Promise<any> {
	return await this.dispatchOperation("sendToUserId", {
		user_id,
		// nest event and data inside the data payload for the operation handler
		data: { event, data },
	})
}
