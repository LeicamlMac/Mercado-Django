const categoriaModel = require('../model/categoriaModel');

const listarCategorias = async (req, res) => {

    try {

        const categorias = await categoriaModel.getCategorias();

        res.status(200).json(categorias);

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

const criarCategoria = async (req, res) => {

    try {

        const { nome } = req.body;

        if (!nome) {

            return res.status(400).json({
                erro: 'Nome obrigatório'
            });

        }

        const categoria = await categoriaModel.criarCategoria(nome);

        res.status(201).json(categoria);

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

const deletarCategoria = async (req, res) => {

    try {

        const { id } = req.params;

        const categoria = await categoriaModel.deletarCategoria(id);

        if (!categoria) {

            return res.status(404).json({
                erro: 'Categoria não encontrada'
            });

        }

        res.status(200).json({
            mensagem: 'Categoria deletada'
        });

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

module.exports = {
    listarCategorias,
    criarCategoria,
    deletarCategoria
};