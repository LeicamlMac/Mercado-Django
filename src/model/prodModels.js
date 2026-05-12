



const db = require('../config/db');

const getProds = async () => {

    const result = await db.query(
        'SELECT * FROM produtos ORDER BY id ASC'
    );

    return result.rows;
};

const criarProduto = async (
    nome,
    preco,
    estoque,
    categoria_id
) => {

    const sql = `
        INSERT INTO produtos
        (nome, preco, estoque, categoria_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;

    const values = [
        nome,
        preco,
        estoque,
        categoria_id
    ];

    const result = await db.query(sql, values);

    return result.rows[0];
};

const editarProduto = async (
    id,
    nome,
    preco,
    estoque,
    categoria_id
) => {

    const sql = `
        UPDATE produtos
        SET
            nome = $1,
            preco = $2,
            estoque = $3,
            categoria_id = $4
        WHERE id = $5
        RETURNING *
    `;

    const values = [
        nome,
        preco,
        estoque,
        categoria_id,
        id
    ];

    const result = await db.query(sql, values);

    return result.rows[0];
};

const deletarProduto = async (id) => {

    const sql = `
        DELETE FROM produtos
        WHERE id = $1
        RETURNING *
    `;

    const result = await db.query(sql, [id]);

    return result.rows[0];
};

module.exports = {
    getProds,
    criarProduto,
    editarProduto,
    deletarProduto
};