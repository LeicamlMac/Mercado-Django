const db = require('../config/db');

const getCategorias = async () => {

    const result = await db.query(
        'SELECT * FROM categorias ORDER BY id ASC'
    );

    return result.rows;
};

const criarCategoria = async (nome) => {

    const sql = `
        INSERT INTO categorias
        (nome)
        VALUES ($1)
        RETURNING *
    `;

    const result = await db.query(sql, [nome]);

    return result.rows[0];
};

const deletarCategoria = async (id) => {

    const sql = `
        DELETE FROM categorias
        WHERE id = $1
        RETURNING *
    `;

    const result = await db.query(sql, [id]);

    return result.rows[0];
};

module.exports = {
    getCategorias,
    criarCategoria,
    deletarCategoria
};