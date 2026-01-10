export type ServiceMessage<T = any | undefined> = {
  provider_id: string;
  event: string;
  payload: T;
};
