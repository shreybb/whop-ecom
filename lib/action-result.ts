export type ActionResult<T = void> =
	| { ok: true; data: T }
	| { ok: false; error: string };

export function actionOk<T = void>(data?: T): ActionResult<T> {
	return { ok: true, data: data as T };
}

export function actionErr(error: string): ActionResult<never> {
	return { ok: false, error };
}
