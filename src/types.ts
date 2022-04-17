export interface IRequest<T = unknown> extends Record<string, any> {
	data?: T;
}

export interface IResponse<T = unknown> {
	request?: Record<string, any>;
	response?: T;
	error?: any;
}

export interface IEvent {
	request?: Record<string, any>;
	data: any;
}

export interface IEmitter<T = unknown> {
	get data(): T;
	get request(): Record<string, any> | undefined;
	emit(event: string, message: any): void;
}
