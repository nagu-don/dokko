import { runScraper } from "./scraper.js";
import { connectDB } from "../config/db.js";
import { updateDatabase } from "./updateDatabase.js";
import cron from "node-cron";

console.log("Update running");

async function update() {

    try {

        await connectDB();
        
        console.log("MongoDB connected.");

        await runScraper();
        await updateDatabase();

       cron.schedule(
            "*/30 7-20 * * *",
            async () => {
                await runScraper();
                await updateDatabase();
            },
            {
                timezone: "Asia/Kathmandu",
            }
        );        


    } catch (error) {

        console.error(
            error
        );
    }
}

export default update;
