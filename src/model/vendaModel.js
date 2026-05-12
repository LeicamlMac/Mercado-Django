const db = require('../config/db');

const criarVenda = async (total) => {

    const sql = `
        INSERT INTO vendas
        (data, total)
        VALUES (NOW(), $1)
        RETURNING *
    `;

    const result = await db.query(sql, [total]);

    return result.rows[0];
};

const criarItemVenda = async (
    venda_id,
    produto_id,
    quantidade,
    preco
) => {

    const sql = `
        INSERT INTO itens_venda
        (venda_id, produto_id, quantidade, preco)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;

    const values = [
        venda_id,
        produto_id,
        quantidade,
        preco
    ];

    const result = await db.query(sql, values);

    return result.rows[0];
};

const listarVendas = async () => {

    const sql = `
        SELECT * FROM vendas
        ORDER BY id DESC
    `;

    const result = await db.query(sql);

    return result.rows;
};

module.exports = {
    criarVenda,
    criarItemVenda,
    listarVendas
};