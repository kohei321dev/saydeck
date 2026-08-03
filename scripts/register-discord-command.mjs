const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
const guildId = process.env.DISCORD_COMMAND_GUILD_ID?.trim();

if (!applicationId || !botToken) {
  console.error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required.");
  process.exitCode = 1;
} else {
  const scope = guildId ? `guilds/${guildId}/commands` : "commands";
  const response = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/${scope}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "saydeck",
        description: "日本語からSayDeck登録候補を作成します",
        type: 1,
        options: [
          {
            type: 3,
            name: "text",
            description: "英語で言いたいこと（日本語、2,000文字以内）",
            required: true,
            max_length: 2_000,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error(`Discord command registration failed (${response.status}): ${body.slice(0, 1_000)}`);
    process.exitCode = 1;
  } else {
    const command = await response.json();
    console.log(`Registered /saydeck command (${command.id}) in ${guildId ? `guild ${guildId}` : "global scope"}.`);
  }
}
