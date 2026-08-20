declare module "cloudflare:workers" { export const env: Record<string,unknown>; }
interface D1Result<T=Record<string,unknown>>{results:T[];success:boolean;meta:Record<string,unknown>}
interface D1PreparedStatement{bind(...values:unknown[]):D1PreparedStatement;run<T=Record<string,unknown>>():Promise<D1Result<T>>;first<T=Record<string,unknown>>():Promise<T|null>;all<T=Record<string,unknown>>():Promise<D1Result<T>>}
interface D1Database{prepare(query:string):D1PreparedStatement;batch<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>}
interface R2PutOptions{httpMetadata?:{contentType?:string}}
interface R2ObjectBody{body:ReadableStream;etag:string;httpMetadata?:{contentType?:string};writeHttpMetadata(headers:Headers):void}
interface R2Bucket{put(key:string,value:ArrayBuffer|ReadableStream|Uint8Array|string,options?:R2PutOptions):Promise<unknown>;get(key:string):Promise<R2ObjectBody|null>}
interface Fetcher{fetch(input:Request|string,init?:RequestInit):Promise<Response>}
