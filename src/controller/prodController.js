const prodModel = require('../model/prodModels');

const getProd = async (req, res) => {

    try {

        const produtos = await prodModel.getProds();

        res.status(200).json(produtos);

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

const criarProduto = async (req, res) => {

    try {

        const {
            nome,
            preco,
            estoque,
            categoria_id
        } = req.body;

        if (!nome || !preco || estoque == null) {

            return res.status(400).json({
                erro: 'Nome, preço e estoque são obrigatórios'
            });

        }

        const produto = await prodModel.criarProduto(
            nome,
            preco,
            estoque,
            categoria_id
        );

        res.status(201).json(produto);

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

const editarProduto = async (req, res) => {

    try {

        const { id } = req.params;

        const {
            nome,
            preco,
            estoque,
            categoria_id
        } = req.body;

        const produto = await prodModel.editarProduto(
            id,
            nome,
            preco,
            estoque,
            categoria_id
        );

        if (!produto) {

            return res.status(404).json({
                erro: 'Produto não encontrado'
            });

        }

        res.status(200).json(produto);

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

const deletarProduto = async (req, res) => {

    try {

        const { id } = req.params;

        const produto = await prodModel.deletarProduto(id);

        if (!produto) {

            return res.status(404).json({
                erro: 'Produto não encontrado'
            });

        }

        res.status(200).json({
            mensagem: 'Produto deletado com sucesso'
        });

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

module.exports = {
    getProd,
    criarProduto,
    editarProduto,
    deletarProduto
};