import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occurred -- no svix headers", {
      status: 400,
    });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occurred", {
      status: 400,
    });
  }

  const { id } = evt.data;
  const eventType = evt.type;

  console.log(`Webhook with an ID of ${id} and type of ${eventType}`);

  // Handling 'user.created' event
  if (eventType === "user.created") {
    try {
      const { 
        email_addresses, 
        primary_email_address_id,
        external_accounts 
      } = evt.data;
      
      console.log("Email addresses array:", email_addresses);
      console.log("Primary email ID:", primary_email_address_id);

      let userEmail: string | null = null;

      // Try to find email in webhook data first
      if (email_addresses && email_addresses.length > 0) {
        const primaryEmail = email_addresses.find(
          (email) => email.id === primary_email_address_id
        );
        userEmail = primaryEmail?.email_address || email_addresses[0]?.email_address;
      }

      // If no email in webhook data, fetch from Clerk API
      if (!userEmail) {
        console.log("No email in webhook, fetching from Clerk API...");
        try {
          const client = await clerkClient();
          const user = await client.users.getUser(evt.data.id!);
          
          console.log("User from API:", {
            emailAddresses: user.emailAddresses,
            primaryEmailAddressId: user.primaryEmailAddressId
          });

          if (user.emailAddresses && user.emailAddresses.length > 0) {
            const primaryEmail = user.emailAddresses.find(
              (email) => email.id === user.primaryEmailAddressId
            );
            userEmail = primaryEmail?.emailAddress || user.emailAddresses[0]?.emailAddress;
          }
        } catch (apiError) {
          console.error("Error fetching user from Clerk API:", apiError);
        }
      }

      console.log("Resolved email:", userEmail);

      if (!userEmail) {
        console.error("Still no email found after API call");
        // Create user without email for now, can be updated later
        // Or return success and handle this case differently
        return new Response("User created but no email available", { status: 200 });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { id: evt.data.id! }
      });

      if (existingUser) {
        console.log("User already exists:", existingUser);
        return new Response("User already exists", { status: 200 });
      }

      // Create the user in the database
      const newUser = await prisma.user.create({
        data: {
          id: evt.data.id!,
          email: userEmail,
          name: evt.data.first_name && evt.data.last_name 
            ? `${evt.data.first_name} ${evt.data.last_name}` 
            : evt.data.first_name || evt.data.last_name || null,
          isSubscribed: false,
        },
      });
      
      console.log("New user created:", newUser);
    } catch (error) {
      console.error("Error creating user in database:", error);
      return new Response("Error creating user", { status: 500 });
    }
  }

  return new Response("Webhook received successfully", { status: 200 });
}