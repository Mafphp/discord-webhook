require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Parse DISCORD_WEBHOOK_URLS from environment variables
// Dynamically load all Discord webhooks from environment variables
const webhookUrls = [];

// Iterate over all env keys
Object.keys(process.env).forEach((key) => {
  const match = key.match(/^DISCORD_WEBHOOK_(\w+)_URL$/); // Match keys like DISCORD_WEBHOOK_AI_CHATBOT_URL
  if (match) {
    const namespaceKey = `DISCORD_WEBHOOK_${match[1]}_NAMESPACE`;
    const urlKey = key;

    const namespace = process.env[namespaceKey];
    const url = process.env[urlKey];

    if (namespace && url) {
      webhookUrls.push({ namespace, webhook_url: url });
      console.log(`Loaded webhook: ${namespace} -> ${url}`);
    }
  }
});

console.log('All loaded webhooks:', webhookUrls);


// Helper function to get the appropriate Discord webhook URL based on namespace only
const getDiscordWebhookUrl = (namespace) => {
  const project = webhookUrls.find((p) => p.namespace === namespace);
  return project ? project.webhook_url : null;
};

// Helper function to send data to Discord
const sendToDiscord = async (webhookUrl, data) => {
  if (!webhookUrl) {
    console.error("No webhook URL found for the specified project.");
    return;
  }

  try {
    await axios.post(webhookUrl, data);
  } catch (error) {
    console.error("Error sending to Discord:", error);
  }
};

// Handler for push events
const handlePushEvent = (payload) => ({
  content: `New push event in **${payload.project.name}**!`,
  embeds: [
    {
      title: 'Push Details',
      description: `A new push has been made to the **${payload.ref}** branch.`,
      color: 7506394,
      fields: [
        {
          name: 'User',
          value: `**${payload.user_name}** (${payload.user_email})`,
          inline: true
        },
        {
          name: 'Commits',
          value: `**${payload.total_commits_count}** new commits`,
          inline: true
        },
        {
          name: 'Project',
          value: `[${payload.project.name}](${payload.project.web_url})`,
          inline: true
        }
      ],
      footer: {
        text: `Pushed at ${new Date(payload.commits[0].timestamp).toLocaleString()}`,
        icon_url: payload.user_avatar || ''
      },
      timestamp: new Date(payload.commits[0].timestamp).toISOString()
    },
    {
      title: 'Commits',
      description: 'Here\'s a summary of the commits:',
      fields: payload.commits.map(commit => ({
        name: `**${commit.title.slice(0, 256)}**`,
        value: `[View commit](${commit.url})\n**${commit.message.slice(0, 1024)}**`,
        inline: false
      }))
    }
  ]
});

// Handler for merge request events
const handleMergeRequestEvent = (payload) => {
  const mergeState = payload.object_attributes.state;

  return {
    content: `Merge request **${payload.object_attributes.title.slice(0, 256)}** in **${payload.project.name}** has been **${mergeState}**!`,
    embeds: [
      {
        title: 'Merge Request Details',
        description: `Merge request from **${payload.object_attributes.source_branch}** to **${payload.object_attributes.target_branch}**.`,
        color: mergeState === 'opened' ? 65280 : 16711680,  // Green for opened, red for closed
        fields: [
          {
            name: 'User',
            value: `**${payload.user.name}** (${payload.user.username})`,
            inline: true
          },
          {
            name: 'State',
            value: `**${mergeState}**`,
            inline: true
          },
          {
            name: 'Project',
            value: `[${payload.project.name}](${payload.project.web_url})`,
            inline: true
          },
          {
            name: 'Description',
            value: (payload.object_attributes.description || 'No description provided').slice(0, 1024),
            inline: false
          }
        ],
        footer: {
          text: `Merge request ${mergeState} at ${new Date(payload.object_attributes.updated_at).toLocaleString()}`,
          icon_url: payload.user.avatar_url || ''
        },
        timestamp: new Date(payload.object_attributes.updated_at).toISOString()
      }
    ]
  };
};

// Endpoint to handle incoming webhooks
app.post('/webhook', async (req, res) => {
  const payload = req.body;

  // Retrieve namespace
  const namespace = payload.project.namespace;

  // Get the appropriate webhook URL
  const webhookUrl = getDiscordWebhookUrl(namespace);

  let data;
  if (payload.object_kind === 'push') {
    data = handlePushEvent(payload);
  } else if (payload.object_kind === 'merge_request') {
    data = handleMergeRequestEvent(payload);
  } else {
    console.log(`Unhandled event type: ${payload.object_kind}`);
    return res.status(400).json({ message: 'Event type not supported' });
  }

  // Send formatted data to Discord
  await sendToDiscord(webhookUrl, data);
  res.status(200).json({ message: 'Webhook processed successfully.' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
