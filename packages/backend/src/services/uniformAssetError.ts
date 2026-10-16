export class UniformAssetError extends Error {
  constructor(message:string,readonly status:400|403|404|409|413|503=400){super(message);}
}
