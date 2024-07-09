const puppeteer = require("puppeteer");
require("dotenv").config();

const scrapeLogic = async (url) => {
  console.log("starting puppeteer launcher");
  const browser = await puppeteer.launch({
    args: [
      "--disable-setuid-sandbox",
      "--no-sandbox",
      "--single-process",
      "--no-zygote",
    ],
    executablePath:
      process.env.NODE_ENV === "production"
        ? process.env.PUPPETEER_EXECUTABLE_PATH
        : puppeteer.executablePath(),
  });
  try {
    const page = await browser.newPage();

    await page.goto(url);

    // await page.screenshot({ path: "example3.png" });

    const content = await page.content();

    if (content) {
      console.log("completed");
      // res.send(content);
    }
  } catch (e) {
    console.error(e);
    // res.send(`Something went wrong while running Puppeteer: ${e}`);
    console.log(`Something went wrong while running Puppeteer: ${e}`);
  } finally {
    await browser.close();
  }
};

module.exports = { scrapeLogic };
