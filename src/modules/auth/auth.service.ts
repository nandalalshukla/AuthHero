import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/hash";


export async function registerUser(email:string, password:string) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new Error("User with email already exists");
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            email, passwordHash,
        },
    });
    return {
        id: user.id,
        email: user.email,
    };
}
