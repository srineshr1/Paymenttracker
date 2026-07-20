import * as argon2 from "argon2";
import { jwtVerify, SignJWT } from "jose";
import { config } from "./config.js";

const encoder = new TextEncoder();

export async function hashPasscode(passcode: string): Promise<string> {
  return argon2.hash(passcode, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPasscode(
  hash: string,
  passcode: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, passcode);
  } catch {
    return false;
  }
}

export type JwtPayload = {
  sub: string;
  username: string;
};

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(encoder.encode(config.jwtSecret));
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      encoder.encode(config.jwtSecret),
    );
    if (!payload.sub || typeof payload.username !== "string") return null;
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}
