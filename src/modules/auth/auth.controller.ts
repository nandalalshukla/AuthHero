import type { Request, Response } from "express";
import { registerUser, loginUser } from "./auth.service";
import { CREATED, OK } from "../../lib/http";

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await registerUser(email, password);
  res.status(CREATED).json({ success: true, data: user });
};

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const user = await loginUser(email, password);
    res.status(OK).json({ success: true, data: user });
};


