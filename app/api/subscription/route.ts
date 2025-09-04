import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export async function POST() {
    const { userId } = await auth();

    if(!userId){
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        
        if(!user){
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        //payment logic in future

        const subscriptionEnds = new Date();
        subscriptionEnds.setMonth(subscriptionEnds.getMonth() + 1);
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                isSubscribed : true,
                subscriptionEnds : subscriptionEnds
            }
        });
        return NextResponse.json({ message: "Subscription updated", subscriptionEnds: updatedUser.subscriptionEnds }, { status: 200 });

    } catch (error) {
        console.error("Error updating subscription:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
    }
}

export async function GET() {
    const {userId} = await auth();

    if(!userId){
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
    
        if(!user){
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const now = Date.now();
        if(user.subscriptionEnds && user.subscriptionEnds.getTime() < now){
            await prisma.user.update({
                where: { id: userId },
                data: {
                    isSubscribed: false,
                    subscriptionEnds: null
                }
            });
            return NextResponse.json({ isSubscribed: false, subscriptionEnds: null }, { status: 200 });
        }
        return NextResponse.json({ isSubscribed: user.isSubscribed, subscriptionEnds: user.subscriptionEnds }, { status: 200 });
        
    } catch (error) {
        console.error("Error fetching subscription status:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}