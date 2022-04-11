const { join } = require("path");
const { rm } = require("fs/promises");

async function main() {
    try {
        await rm(join(process.cwd(), "dist"), { recursive: true });
    } catch (ex) {}
}

main();
