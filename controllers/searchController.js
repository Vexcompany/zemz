const appleSearch = require('../services/appleSearch');

exports.search = async (req, res, next) => {
    try {
        const { q, region = 'id' } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({
                status: false,
                message: 'Parameter q (query) diperlukan'
            });
        }

        const results = await appleSearch.search(q, region);
        res.json(results);

    } catch (error) {
        next(error);
    }
};