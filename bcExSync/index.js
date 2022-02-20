const AWS = require("aws-sdk"),
      axios = require('axios').default,
      dynamoDB = new AWS.DynamoDB.DocumentClient({ region: process.env.REGION }),
      get_bc_url = process.env.GET_BC_URL,
      get_ex_orders_url = process.env.GET_EX_ORDERS_URL,
      get_ex_order_url = process.env.GET_EX_ORDER_URL,
      get_ex_lines_url = process.env.GET_EX_LINES_URL,
      put_ex_url = process.env.PUT_EX_URL,
      headers = {
        'Content-Type': 'application/json',
        'X-Auth-Token': process.env.AUTH_TOKEN
    };

exports.handler = async () => {
    // Get orders only from the last hour
    let date = new Date(),
        last_hour = date.setHours(date.getHours() - 1);
        last_hour = new Date(last_hour).toISOString();
        let orders = await axios.get(get_bc_url, {
            headers: headers,
            params: {
                min_date_created: last_hour
            }
        });
        // Process only orders with the 'Awaiting Fulfillment' status
        await Promise.all(
                orders.data.map(async (element) => {
                const { id, custom_status } = element;
                if(custom_status === 'Awaiting Fulfillment') {
                    await processSingleBcOrder(id);
                }
            })
        );
};

// Get total value from BigCommerce
async function processSingleBcOrder(id) {
    // Get prosucts url for a Bc order
    await axios.get(get_bc_url + '/' + id, {
        headers: headers
    })
    .then(async (response) => {
        let products_url = response.data.products.url,
            products_totals = await getBcProductsTotals(products_url);
        await syncExOrderLine(id, products_totals);
    })
    .catch(function(error) {
        console.log(error);
    });
}

// Get totals for products in BC
async function getBcProductsTotals(url) {
    let products_totals = [];
    await axios.get(url, {
        headers: headers
    })
    .then(async (response) => {
        await response.data.map(async (element) => {
            products_totals.push({
                total: element.price_inc_tax,
                qty: element.quantity
            });
        })
    })
    .catch(function(error) {
        console.log(error);
    });
    return products_totals;
}

// Update an order in Exact
async function syncExOrderLine(id, products_totals) {
    let access_token = await getAccessToken(),
        guids_and_vats = await findExactGuidsAndVats(id);
    for (let i = 0; i < products_totals.length; i++) { 
        const { guid, vatcode } = guids_and_vats[i],
              { total, qty } = products_totals[i];
        await putToExact(guid, vatcode, total, qty);
    }
}

async function putToExact(guid, vatcode, total, qty) {
    let access_token = await getAccessToken();
    // Strip additional spaces
    vatcode = vatcode.replace(/\W/g, "");
    if(vatcode == 1) {
        vatcode = 3;
    }
    else if(vatcode == 2) {
        vatcode = 4;
    }
    let data = {
        'NetPrice': total,
        'VATCode': vatcode,
        // 'Quantity': qty
    },
    headers = {
        'authorization': 'Bearer ' + access_token
    };

    if(guid != '') {
        await axios.put(put_ex_url + "(guid'" + guid + "')", data, { headers })
        .then(async (response) => {
            console.log(response);
        })
        .catch(function(error) {
            console.log(error);
        });
    }
}

// Fetch last 1000 orders and find an Exact GUID for a needed BigCommerce order
async function findExactGuidsAndVats(id) {
    let access_token = await getAccessToken(),
        order_guid = '',
        guids_and_vats = [],
        date = new Date(),
        last_month = date.setMonth(date.getMonth()-1),
        found = null;

        // Get an order GUID with a corresponding YourRef and put it into order_guid
        await axios.get(get_ex_orders_url + 'select=OrderID,YourRef,OrderDate$filter=Timestamp eq ' + last_month, {
            headers: {
                'authorization': 'Bearer ' + access_token
            }
        })
        .then(async (response) => {
            await Promise.all(response.data.d.results.map(async (element) => {
                if(element.YourRef == 'BC Order Id: ' + id) {
                    order_guid = element.OrderID;
                }
            }));
        })
        .catch(function(error) {
            console.log(error);
        });

        // Get order lines GUIDS and VATs from the order above
        await axios.get(get_ex_order_url + "(guid'" + order_guid + "')?$select=SalesOrderLines&$expand=SalesOrderLines", {
            headers: {
                'authorization': 'Bearer ' + access_token
            }
        })
        .then(async (response) => {
            await Promise.all(response.data.d.SalesOrderLines.results.map(async (element) => {
                guids_and_vats.push({
                    guid: element.ID,
                    vatcode: element.VATCode
                })
            }));
        })
        .catch(function(error) {
            console.log(error.response.data.message);
        });
    return guids_and_vats.reverse();
}

// Get a fresh access token from DynamoDb for Exact authorization
async function getAccessToken() {
    let access_token = '';
    await dynamoDB.get({
        TableName: "tokens",
        Key: {
            id: 1
        }
    }).promise()
        .then(async (data) => {
            access_token = data.Item.access_token;
        })
        .catch(console.error);
    return access_token;
}