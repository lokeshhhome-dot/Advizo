const axios = require("axios");

const getMenus = async ({ shop, accessToken }) => {
  try {
    const response = await axios.post(
      `https://${shop}/admin/api/2023-10/graphql.json`,
      {
        query: `
          {
            menus(first: 10) {
              edges {
                node {
                  id
                  handle
                  title
                  items {
                    title
                    url
                    items {
                      title
                      url
                      items {
                        title
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        `,
      },
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.data.menus.edges;
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
};

module.exports = { getMenus };
