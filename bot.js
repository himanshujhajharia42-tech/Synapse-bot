require("dotenv").config();
const http = require("http");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

let botStatus = "waiting_for_token";
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ app: "HANU Discord Bot", status: botStatus }));
});
server.listen(process.env.PORT || 3000, () => console.log("HANU bot health endpoint ready"));

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is missing. Add it in the Render service environment settings.");
} else {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Check HANU latency"),
    new SlashCommandBuilder().setName("serverinfo").setDescription("Show this server's information"),
    new SlashCommandBuilder().setName("help").setDescription("Show HANU's starter commands")
  ].map(c => c.toJSON());

  client.once("ready", async () => {
    botStatus = "online";
    console.log(`HANU online as ${client.user.tag}`);
    try {
      await new REST({ version: "10" }).setToken(token).put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log("Registered starter slash commands.");
    } catch (e) { console.error("Command registration failed:", e); }
  });
  client.on("error", e => console.error("Discord client error:", e));
  client.on("shardDisconnect", () => { botStatus = "reconnecting"; });
  client.on("shardResume", () => { botStatus = "online"; });

  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "ping") return interaction.reply({ content: `Pong! ${client.ws.ping}ms`, ephemeral: true });
    if (interaction.commandName === "help") return interaction.reply({ content: "**HANU starter commands**\n/ping — latency\n/serverinfo — server details\n/help — this message", ephemeral: true });
    if (interaction.commandName === "serverinfo") return interaction.reply({ content: `**${interaction.guild.name}**\nMembers: ${interaction.guild.memberCount}\nCreated: <t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:D>`, ephemeral: true });
  });
  client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild) return;
    const prefix = process.env.BOT_PREFIX || "hanu";
    if (!message.content.toLowerCase().startsWith(prefix + " ")) return;
    const [command] = message.content.slice(prefix.length).trim().toLowerCase().split(/\s+/);
    if (command === "ping") message.reply(`Pong! ${client.ws.ping}ms`);
    else if (command === "help") message.reply("HANU starter commands: `hanu ping`, `hanu help`. More modules are being built.");
  });
  client.login(token).catch(e => { botStatus = "login_error"; console.error("Discord login failed:", e); });
}