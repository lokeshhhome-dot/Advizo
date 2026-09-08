const { default: axios } = require("axios");

const getAppUninstallWebhooks = async (shop, accessToken) => {
    const query = `
      query {
        webhookSubscriptions(first: 100) {
          edges {
            node {
              id
              topic
              endpoint {
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
        `https://${shop}/admin/api/2024-01/graphql.json`,
        { query },
        {
            headers: {
                "X-Shopify-Access-Token": accessToken,
                "Content-Type": "application/json",
            },
        }
    );

    return response.data.data.webhookSubscriptions.edges.filter(
        ({ node }) => node.topic === "APP_UNINSTALLED"
    );
};



const deleteWebhookById = async (shop, accessToken, webhookId) => {
    const mutation = `
      mutation {
        webhookSubscriptionDelete(id: "${webhookId}") {
          deletedWebhookSubscriptionId
          userErrors {
            message
          }
        }
      }
    `;

    const response = await axios.post(
        `https://${shop}/admin/api/2024-01/graphql.json`,
        { query: mutation },
        {
            headers: {
                "X-Shopify-Access-Token": accessToken,
                "Content-Type": "application/json",
            },
        }
    );

    const errors = response.data.data.webhookSubscriptionDelete.userErrors;
    if (errors.length) {
        throw new Error(errors[0].message);
    }

    console.log("🗑️ Deleted webhook:", webhookId);
};

const deleteAllAppUninstallWebhooks = async (shop, accessToken) => {
    try {
        const webhooks = await getAppUninstallWebhooks(shop, accessToken);

        if (!webhooks.length) {
            console.log("ℹ️ No APP_UNINSTALLED webhooks found");
            return;
        }

        for (const { node } of webhooks) {
            console.log("Deleting webhook:", node.endpoint?.callbackUrl);
            await deleteWebhookById(shop, accessToken, node.id);
        }

        console.log("✅ All APP_UNINSTALLED webhooks deleted");
    } catch (error) {
        console.error("❌ Error deleting uninstall webhooks:", error.message);
        throw error;
    }
};




module.exports = { deleteAllAppUninstallWebhooks };