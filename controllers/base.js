const db = require('../config/db.config.js');
const axios = require('axios');
const sequelize = db.sequelize;
const express = require('express');
const models = require('../models');

class BaseController {
  constructor(model) {
    this.model = model;
    this.router = express.Router();
    this.validAttributesCache = new Set(Object.keys(this.model.rawAttributes));
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.post('/list', this.listWithReferences.bind(this));
    this.router.get('/:id', this.read.bind(this));
    this.router.post('/', this.create.bind(this));
    this.router.put('/:id', this.update.bind(this));
    this.router.delete('/:id', this.delete.bind(this));
  }

  listArgVerify(req, res, queryOptions) {
    throw "Method need to be implemented in child class";
  }

  async afterCreate(req, res, newObject, transaction) {
    throw "Method need to be implemented in child class";
  }

  async listWithReferences(req, res) {
    try {
      const { user, page = 1, limit = 10, attributes, include, where } = req.body;

      const offset = (page - 1) * limit;

      let validAttributes = attributes ? attributes.filter(attr => this.validAttributesCache.has(attr)) : null;
      if (validAttributes && validAttributes.length === 0) {
        return res.status(400).json({ error: 'No valid attributes provided' });
      }

      let queryWhere = {};
      if (where) {
        for (let key in where) {
          if (!this.validAttributesCache.has(key)) {
            return res.status(400).json({ error: `Invalid attribute for filtering: ${key}` });
          }
          queryWhere[key] = where[key];
        }
      }

      const modelAssociations = this.model.associations;
      for (const key in modelAssociations) {
        const association = modelAssociations[key];
        console.log(association);
      }

      let queryInclude = [];
      if (include) {
        include.forEach(inc => {
          if (this.model.associations[inc] && this.model.associations[inc].target) {
            queryInclude.push({ model: this.model.associations[inc].target, as: inc });
          } else {
            return res.status(400).json({ error: `Invalid include parameter: ${inc}` });
          }
        });
      }

      const queryOptions = {
        attributes: validAttributes,
        where: queryWhere,
        include: queryInclude,
        limit: limit,
        offset: offset,
        order: [['id', 'ASC']]
      };
      this.listArgVerify(req, res, queryOptions);

      console.log(queryOptions);
      const results = await this.model.findAndCountAll(queryOptions);

      res.json({
        data: results.rows,
        total: results.count,
        totalPages: Math.ceil(results.count / limit),
        currentPage: page
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async list(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      const results = await this.model.findAndCountAll({
        limit: limit,
        offset: offset,
        order: [['id', 'ASC']],
      });

      res.json({
        data: results.rows,
        total: results.count,
        totalPages: Math.ceil(results.count / limit),
        currentPage: page
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async read(req, res) {
    try {
      const id = req.params.id;
      const item = await this.model.findByPk(id);
      if (!item) {
        res.status(404).json({ error: 'Item not found' });
      } else {
        res.json(item);
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async create(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const newData = req.body;

      const modelAssociations = this.model.associations;
      for (const key in modelAssociations) {
        const association = modelAssociations[key];
        if (association.associationType === 'BelongsToMany') {
          const foreignKey = association.foreignKey;
          const associatedModel = association.target;
          const foreignKeyId = newData[foreignKey];
          if (foreignKeyId) {
            const associatedInstance = await associatedModel.findByPk(foreignKeyId, { transaction });
            if (!associatedInstance) {
              throw new Error(`${associatedModel.name} with ID ${foreignKeyId} not found`);
            }
          }
        }
      }

      for (const key in modelAssociations) {
        const association = modelAssociations[key];
        if (association.associationType === 'BelongsTo') {
          const foreignKey = association.foreignKey;
          const associatedModel = association.target;
          const foreignKeyId = newData[foreignKey];
          if (foreignKeyId) {
            const associatedInstance = await associatedModel.findByPk(foreignKeyId, { transaction });
            if (!associatedInstance) {
              throw new Error(`${associatedModel.name} with ID ${foreignKeyId} not found`);
            }
            newData[foreignKey] = foreignKeyId;
          } else {
            throw new Error(`${associatedModel.name} with ID ${foreignKeyId} not found`);
          }
        }
      }

      const newItem = await this.model.create(newData, { transaction });

      await this.afterCreate(req, res, newItem, transaction);
      await transaction.commit();
      res.status(201).json(newItem);
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = req.params.id;
      const [updated] = await this.model.update(req.body, {
        where: { id: id }
      });

      if (updated) {
        const updatedItem = await this.model.findByPk(id);
        res.json(updatedItem);
      } else {
        res.status(404).json({ error: 'Item not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async delete(req, res) {
    try {
      const id = req.params.id;
      const deleted = await this.model.destroy({
        where: { id: id }
      });

      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ error: 'Item not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async proxyRequest(req, res, targetUrl) {
    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        params: req.query,
        data: req.body,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      res.status(response.status).send(response.data);
    } catch (error) {
      console.error('Error proxying request:', error.message);
      res.status(error.response ? error.response.status : 500).send(error.message);
    }
  }
}

module.exports = BaseController;
