const AWS = require("aws-sdk"),
      axios = require('axios').default,
      dynamoDB = new AWS.DynamoDB.DocumentClient({ region: process.env.REGION }),
      client_id = process.env.CLIENT_ID,
      client_secret = process.env.CLIENT_SECRET,
      post_url = process.env.POST_URL,
      delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
      token_headers = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
    };
exports.handler = async () => {
    await dynamoDB.get({
            TableName: "tokens",
            Key: {
                id: 1
            }
        }).promise()
            .then(async function(data) {
                // Wait for 31 seconds because CloudWatch cron doesn't support subminute values
                await delay(31000);
                const { time, refresh_token } = data.Item,
                      rt_params = new URLSearchParams();
                rt_params.append('refresh_token', refresh_token);
                rt_params.append('grant_type', 'refresh_token');
                rt_params.append('client_id', client_id);
                rt_params.append('client_secret', client_secret);
                await axios.post(post_url, rt_params, token_headers)
                    .then(async function(response) {
                        console.log(response.data);
                        const { access_token, refresh_token } = response.data;
                        await put_tokens(access_token, refresh_token);
                    })
                    .catch(function(error) {
                        console.log(error);
                    });
            })
            .catch(console.error);
};

async function put_tokens (access_token, refresh_token) { 
  dynamoDB.put({
          TableName: "tokens",
          Item: {
              id: 1,
              access_token: access_token,
              refresh_token: refresh_token,
              time: Date.now()
          }
  }).promise()
      .then(data => console.log(data))
      .catch(console.error);
  }