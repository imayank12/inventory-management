const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mysql = require('mysql2/promise');
let con;

(async function connectToDB() {
    con = await mysql.createConnection({
        database: 'inventory',
        host: 'localhost',
        user: 'root',
        password: 'password1234',
        multipleStatements: true,
    });
})();

// grn handlers
const grnGetHandler = async (req, res) => {
    const getAllGrnsQuery = `SELECT * FROM grn`
    const getAllGrnLineItemsQuery = `SELECT * FROM grn_line_item`

    try {
        const allGrns = await con.query(getAllGrnsQuery).then((allGrnData) => allGrnData[0])
        const allGrnLineItems = await con.query(getAllGrnLineItemsQuery).then((allGrnLineItmesData) => allGrnLineItmesData[0])

        const allGrnsModified = allGrns.map((grn) => {
            const filteredGrnLineItems = allGrnLineItems.filter(grnLineItem => grnLineItem.grn_id === grn.id)
            return { ...grn, grn_line_items: [filteredGrnLineItems] }
        })
        res.send(allGrnsModified)
    } catch (err) {
        res.send(err)
    }
}

const grnPostHandler = async (req, res) => {
    const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const { invoiceNumber, vendorName, vendorFullAddress, grnLineItems, date } = req.body

    const grnInsertQuery = `INSERT INTO grn (created_at,updated_at,status,invoice_number,vendor_name,vendor_full_address,date) VALUES (?,?,?,?,?,?,?)`
    const values = [createdAt, createdAt, 'GENERATED', invoiceNumber, vendorName, vendorFullAddress, date]


    try {
        const grnInsertResult = await con.query(grnInsertQuery, values)

        const lineItemInsertQuery = `INSERT INTO grn_line_item (created_at, updated_at, product_name, quantity, stock_price, grn_id) VALUES ?`
        const lineItemValues = grnLineItems.map((grnLineItem) => {
            const { productName, quantity, stockPrice } = grnLineItem
            return [createdAt, createdAt, productName, quantity, stockPrice, grnInsertResult[0].insertId]
        })

        const grnLineItemsInsertResult = await con.query(lineItemInsertQuery, [lineItemValues])
        res.send(
            `Inserted ${grnInsertResult[0].affectedRows} GRN with ${grnLineItemsInsertResult[0].affectedRows} GRN Line Item`
        )
    } catch (err) {
        res.send(err)
    }
}

const grnPutHandler = async (req, res) => {
    const updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const { id, invoice_number, vendor_name, vendor_full_address, grn_line_items, date } = req.body

    const grnUpdateQuery = `UPDATE grn SET updated_at = ?, invoice_number = ?, vendor_name = ?, vendor_full_address = ?, date = ? WHERE id = ?`
    const updatedGrnValues = [updated_at, invoice_number, vendor_name, vendor_full_address, date, id]

    const grnLineItemsUpdateQuery = grn_line_items.map((grnLineItem) => {
        const { id, product_name, quantity, stock_price } = grnLineItem
        return `UPDATE grn_line_item SET updated_at = ${JSON.stringify(updated_at)}, product_name = ${JSON.stringify(product_name)}, quantity = ${quantity}, stock_price = ${stock_price} WHERE id = ${id};`
    }).join('')

    await con.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await con.beginTransaction();

    try {
        await con.query(grnUpdateQuery, updatedGrnValues)
        if (grn_line_items?.length) {
            const r = await con.query(grnLineItemsUpdateQuery)
            if (r[0][0].affectedRows === 0) {
                throw 'Error: one or all grn line item id not found'
            }
        }

        await con.commit();
        res.send('grn updated');
    } catch (err) {
        con.rollback();
        res.send(err)
    }
}

const grnDeleteHandler = async (req, res) => {
    const grnDeleteQuery = `UPDATE grn SET deleted = 1 WHERE id = ${req.body.id}`
    try {
        const grnDeleteResult = await con.query(grnDeleteQuery)
        if (grnDeleteResult[0].affectedRows === 0) {
            throw `Error: Could not find grn with id=${req.body.id}`
        }
        res.send(`Deleted 1 grn`)
    } catch (err) {
        res.send(err)
    }
}

const grnUpdateStatusHandler = async (req, res) => {
    const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const { id, status } = req.body

    const getLineItemsQuery = `SELECT id, product_name, quantity, stock_price FROM grn_line_item WHERE grn_id=${id}`
    const updateStatusQuery = `UPDATE grn SET status = ${JSON.stringify(status)} WHERE id = ${id}`
    const insertItemQuery = `INSERT INTO item (created_at, updated_at, product_name, quantity, stock_price) VALUES ? ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity);`

    await con.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await con.beginTransaction();
    try {
        const grnLineItems = await con.query(getLineItemsQuery).then(res => res[0])


        const values = grnLineItems.map((grnLineItem) => {
            const { product_name, quantity, stock_price } = grnLineItem
            return [createdAt, createdAt, product_name, quantity, stock_price]
        })

        const updateStatusResult = await con.query(updateStatusQuery)
        if (updateStatusResult[0].affectedRows === 0) {
            throw `Error: Could not find any grn with id = ${id}`
        }

        if (grnLineItems.length > 0) {
            await con.query(insertItemQuery, [values])
        }

        await con.commit();
        res.send(`Success: Status updated to ${status} for grn with id=${id}`)
    } catch (err) {
        con.rollback();
        res.send(err)
    }
}

// order handlers
const orderGetHandler = async (req, res) => {
    const getAllOrdersQuery = `SELECT * FROM order_table`
    const getAllOrderLineItemsQuery = `SELECT * FROM order_line_item`

    try {
        const allOrders = await con.query(getAllOrdersQuery).then((allOrderData) => allOrderData[0])
        const allOrderLineItems = await con.query(getAllOrderLineItemsQuery).then((allOrderLineItmesData) => allOrderLineItmesData[0])

        const allOrdersModified = allOrders.map((order) => {
            const filteredOrderLineItems = allOrderLineItems.filter(orderLineItem => orderLineItem.order_id === order.id)
            return { ...order, order_line_items: [filteredOrderLineItems] }
        })
        res.send(allOrdersModified)
    } catch (err) {
        res.send(err)
    }
}

const orderPostHandler = async (req, res) => {
    const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const { invoice_number, customer_name, customer_full_address, order_line_items, date } = req.body

    const orderInsertQuery = `INSERT INTO order_table (created_at, updated_at, status, invoice_number, customer_name, customer_full_address, date) VALUES (?,?,?,?,?,?,?)`
    const values = [created_at, created_at, 'GENERATED', invoice_number, customer_name, customer_full_address, date]


    try {
        const orderInsertResult = await con.query(orderInsertQuery, values)

        const lineItemInsertQuery = `INSERT INTO order_line_item (created_at, updated_at, product_name, quantity, sell_price, order_id) VALUES ?`
        const lineItemValues = order_line_items.map((orderLineItem) => {
            const { product_name, quantity, sell_price } = orderLineItem
            return [created_at, created_at, product_name, quantity, sell_price, orderInsertResult[0].insertId]
        })

        const orderLineItemsInsertResult = await con.query(lineItemInsertQuery, [lineItemValues])
        res.send(
            `Inserted ${orderInsertResult[0].affectedRows} Order with ${orderLineItemsInsertResult[0].affectedRows} Order Line Item`
        )
    } catch (err) {
        res.send(err)
    }
}

const orderPutHandler = async (req, res) => {
    const updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const { id, invoice_number, customer_name, customer_full_address, order_line_items, date } = req.body

    const orderUpdateQuery = `UPDATE order_table SET updated_at = ?, invoice_number = ?, customer_name = ?, customer_full_address = ?, date = ? WHERE id = ?`
    const updatedOrderValues = [updated_at, invoice_number, customer_name, customer_full_address, date, id]

    const orderLineItemsUpdateQuery = order_line_items.map((order_line_item) => {
        const { id, product_name, quantity, sell_price } = order_line_item
        return `UPDATE order_line_item SET updated_at = ${JSON.stringify(updated_at)}, product_name = ${JSON.stringify(product_name)}, quantity = ${quantity}, sell_price = ${sell_price} WHERE id = ${id};`
    }).join('')

    await con.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await con.beginTransaction();

    try {
        await con.query(orderUpdateQuery, updatedOrderValues)
        if (order_line_items?.length) {
            const orderLineItemsResult = await con.query(orderLineItemsUpdateQuery)
            if (orderLineItemsResult[0][0].affectedRows === 0) {
                throw 'Error: one or all order line item id not found'
            }
        }

        await con.commit();
        res.send('Order updated');
    } catch (err) {
        con.rollback();
        res.send(err)
    }
}

const orderDeleteHandler = async (req, res) => {
    const orderDeleteQuery = `UPDATE order_table SET deleted = 1 WHERE id = ${req.body.id}`
    try {
        const orderDeleteResult = await con.query(orderDeleteQuery)
        if (orderDeleteResult[0].affectedRows === 0) {
            throw `Error: Could not find order with id=${req.body.id}`
        }
        res.send(`Deleted 1 order`)
    } catch (err) {
        res.send(err)
    }
}

const orderUpdateStatusHandler = async (req, res) => {
    const { id, status } = req.body

    const updateStatusQuery = `UPDATE order_table SET status = ${JSON.stringify(status)} WHERE id = ${id}`
    const getLineItemsQuery = `SELECT product_name FROM order_line_item WHERE order_id=${id}`
    const deleteItemQuery = `DELETE FROM item WHERE (product_name) IN (?)`

    await con.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await con.beginTransaction();
    try {
        const items = await con.query(getLineItemsQuery).then(res => res[0])

        const values = items.map((orderLineItem) => orderLineItem.product_name)

        await con.query(updateStatusQuery)
        await con.query(deleteItemQuery, [values])

        await con.commit();
        res.send(`Status updated to ${status} for order with id=${id}`)
    } catch (err) {
        con.rollback();
        res.send(err)
    }
}

// item handlers
const itemGetHandler = async (req, res) => {
    const getAllItemsQuery = `SELECT * FROM item`

    try {
        const allItems = await con.query(getAllItemsQuery).then((allItemData) => allItemData[0])
        res.send(allItems)
    } catch (err) {
        res.send(err)
    }
}

app.use(bodyParser.json())
app.get("/", (req, res) => { res.send('hello') });

// grn api
app.put("/grn/update-status", grnUpdateStatusHandler);

app.get("/grn", grnGetHandler);
app.post("/grn", grnPostHandler);
app.put("/grn", grnPutHandler);
app.delete("/grn", grnDeleteHandler);

// order api
app.put("/order/update-status", orderUpdateStatusHandler);

app.get("/order", orderGetHandler);
app.post("/order", orderPostHandler);
app.put("/order", orderPutHandler);
app.delete("/order", orderDeleteHandler);

// item api
app.get("/item", itemGetHandler);

app.use(express.static("public"));

module.exports = { app };