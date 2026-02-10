import type { Request, Response } from "express";
import { registerUser } from "./auth.service";

export async function register(req: Request, res: Response) {
    try {
        const { email, password } = req.body;
        const user = await registerUser(email, password);
        res.status(201).json(user);
        
    } catch (error:any) {
        res.status(400).json({error: error.message});
        
    }
    
    
}