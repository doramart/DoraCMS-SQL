/*
 * @Author: doramart 
 * @Date: 2019-06-20 18:55:40 
 * @Last Modified by: doramart
 * @Last Modified time: 2020-08-14 20:24:44
 */
const Controller = require('egg').Controller;
const shell = require('shelljs');
const workPath = process.cwd();
const pkg = require(`${workPath}/package.json`)
const _ = require('lodash');
const env = process.env.NODE_ENV;

class PluginController extends Controller {

    async list() {
        const {
            ctx,
            service
        } = this;
        try {

            let payload = ctx.query;
            let helpType = ctx.query.helpType;
            let queryObj = {
                type: {
                    $ne: '1'
                }
            };

            if (helpType) {
                queryObj.type = helpType;
            }

            let pluginList = await ctx.service.plugin.find(payload, {
                query: queryObj,
                searchKeys: ['alias', 'enName', 'name'],
                include: [{
                    as: 'user',
                    attributes: ['name', 'userName', 'id']
                }]
            });

            let currentPluginList = [];
            if (!_.isEmpty(pluginList) && !_.isEmpty(pluginList.docs)) {

                let renderPluginList = JSON.parse(JSON.stringify(pluginList.docs));
                for (const pluginItem of renderPluginList) {
                    let pluginShopItem = await this.ctx.helper.reqJsonData(this.app.config.doracms_api + '/api/pluginManage/getOne?id=' + pluginItem.pluginId);
                    if (!_.isEmpty(pluginShopItem)) {
                        if (Number((pluginShopItem.version).split('.')) == Number((pluginShopItem.version).split('.'))) {
                            pluginItem.shouldUpdate = true;
                            pluginItem.targetVersion = pluginShopItem.version;
                        } else {
                            pluginItem.shouldUpdate = false;
                        }
                    } else {
                        throw new Error(ctx.__('validate_error_params'));
                    }
                }
                currentPluginList = _.assign({}, pluginList, {
                    docs: renderPluginList
                });

            } else {
                currentPluginList = pluginList;
            }


            ctx.helper.renderSuccess(ctx, {
                data: currentPluginList
            });

        } catch (err) {

            ctx.helper.renderFail(ctx, {
                message: err
            });

        }
    }

    async installPlugin() {

        const {
            ctx,
            service
        } = this;
        try {

            let pluginId = ctx.query.pluginId;

            let targetPlugin = await ctx.service.plugin.item({
                query: {
                    pluginId
                }
            })

            if (!_.isEmpty(targetPlugin)) {
                throw new Error('您已经安装了该插件！');
            }

            // 1、获取插件信息
            let pluginInfos = await this.ctx.helper.reqJsonData(this.app.config.doracms_api + '/api/pluginManage/getOne?id=' + pluginId);

            if (_.isEmpty(pluginInfos)) {
                throw new Error('未找到该插件');
            }

            if (!_.isEmpty(pluginInfos)) {

                shell.exec(`cd ${workPath}`);

                shell.exec(`npm install ${pluginInfos.pkgName} --save --registry=https://registry.npm.taobao.org`);

                // 2、初始化数据表
                if (pluginInfos.initData) {
                    await this.app.initExtendData(ctx, pluginInfos);
                }

                // 3、插入resource数据
                await this.app.initResourceData(ctx, pluginInfos);

                // 4、插入配置文件
                await this.app.initPluginConfig(pluginInfos);

                // 5、保存插件基本信息到本地
                let currentPluginInfo = _.assign({}, pluginInfos, {
                    pluginId: pluginInfos.id,
                    installor: ctx.session.adminUserInfo.id,
                    createTime: new Date()
                })
                delete currentPluginInfo.id;
                await ctx.service.plugin.create(currentPluginInfo);

                ctx.helper.renderSuccess(ctx);

                // 6 重启服务
                (env == 'production') && setTimeout(() => {
                    shell.exec(`pm2 restart ${pkg.name}`);
                }, 1000)

            } else {
                throw new Error(ctx.__('validate_error_params'));
            }


        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async unInstallPlugin() {

        const {
            ctx,
            service
        } = this;
        try {

            let targetId = ctx.query.pluginId;

            let pluginInfos = await ctx.service.plugin.item({
                query: {
                    id: targetId
                }
            })

            if (_.isEmpty(pluginInfos)) {
                throw new Error(ctx.__('validate_error_params'));
            }

            shell.exec(`cd ${workPath}`);

            // 1、npm uninstall 卸载
            shell.exec(`npm uninstall ${pluginInfos.pkgName}`);

            // 2、删除数据表
            if (pluginInfos.initData) {
                await this.app.initExtendData(ctx, pluginInfos, 'uninstall');
            }

            // 3、删除插入的resource数据
            await this.app.initResourceData(ctx, pluginInfos, 'uninstall');

            // 4、删除配置文件
            await this.app.initPluginConfig(pluginInfos, 'uninstall');

            // 5、删除插件基本信息
            await ctx.service.plugin.removes(targetId);

            ctx.helper.renderSuccess(ctx);

            // 6 重启服务
            (env == 'production') && setTimeout(() => {
                shell.exec(`pm2 restart ${pkg.name}`);
            }, 1000)

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async updatePlugin() {

        const {
            ctx,
            service
        } = this;
        try {

            let targetId = ctx.query.pluginId;

            let pluginInfos = await ctx.service.plugin.item({
                query: {
                    id: targetId
                }
            })

            if (_.isEmpty(pluginInfos)) {
                throw new Error(ctx.__('validate_error_params'));
            }

            let pluginItem = await this.ctx.helper.reqJsonData(this.app.config.doracms_api + '/api/pluginManage/getOne?id=' + pluginInfos.pluginId);

            if (!_.isEmpty(pluginItem)) {
                delete pluginItem.id;
                pluginItem.updateTime = new Date();
                await ctx.service.plugin.update(targetId, pluginItem);

                shell.exec(`cd ${workPath}`);

                shell.exec(`npm install ${pluginItem.pkgName} --save --registry=https://registry.npm.taobao.org`);

                // 6 重启服务
                (env == 'production') && setTimeout(() => {
                    shell.exec(`pm2 restart ${pkg.name}`);
                }, 1000)

            }

            ctx.helper.renderSuccess(ctx);

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async enablePlugin() {

        const {
            ctx,
            service
        } = this;
        try {

            let fields = ctx.request.body;
            let targetId = fields.id;
            let state = fields.state;

            let pluginInfos = await ctx.service.plugin.item({
                query: {
                    id: targetId
                }
            })

            if (_.isEmpty(pluginInfos)) {
                throw new Error(ctx.__('validate_error_params'));
            }

            await ctx.service.plugin.update(targetId, {
                state
            })

            ctx.helper.renderSuccess(ctx);

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async getOne() {
        const {
            ctx,
            service
        } = this;
        try {
            let id = ctx.query.id;

            let targetItem = await ctx.service.plugin.item({
                query: {
                    id: id
                }
            });

            ctx.helper.renderSuccess(ctx, {
                data: targetItem
            });

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }

    }

    async removes() {
        const {
            ctx,
            service
        } = this;
        try {
            let targetIds = ctx.query.ids;
            await ctx.service.plugin.removes(targetIds);
            ctx.helper.renderSuccess(ctx);

        } catch (err) {

            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async getPluginShopList() {
        const {
            ctx,
            service
        } = this;
        try {

            let payload = ctx.query;
            let pluginList = await this.ctx.helper.reqJsonData(this.app.config.doracms_api + '/api/pluginManage/getList', payload);
            if (!_.isEmpty(pluginList) && !_.isEmpty(pluginList.docs)) {
                let renderPluginList = JSON.parse(JSON.stringify(pluginList.docs));
                for (const pluginItem of renderPluginList) {
                    let targetItem = await ctx.service.plugin.item({
                        query: {
                            pluginId: pluginItem.id
                        }
                    });
                    if (!_.isEmpty(targetItem)) {
                        pluginItem.installed = true;
                    } else {
                        pluginItem.installed = false;
                    }
                }
                pluginList.docs = renderPluginList;
            }
            ctx.helper.renderSuccess(ctx, {
                data: pluginList
            });

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async getPluginShopItem() {
        try {
            const {
                ctx,
                service
            } = this;

            let targetId = ctx.query.id;

            if (!targetId) {
                throw new Error(ctx.__('validate_error_params'));
            }

            let pluginItem = await this.ctx.helper.reqJsonData(this.app.config.doracms_api + '/api/pluginManage/getOne?id=' + targetId);

            ctx.helper.renderSuccess(ctx, {
                data: pluginItem
            });

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async createInvoice() {

        const {
            ctx,
            service
        } = this;

        try {

            let targetId = ctx.request.body.pluginId;

            let pluginItem = await this.ctx.helper.reqJsonData(this.app.config.doracms_api + '/api/pluginManage/getOne?id=' + targetId);
            if (_.isEmpty(pluginItem)) {
                throw new Error(ctx.__('validate_error_params'));
            }
            let invoiceData = {
                subject: pluginItem.name,
                amount: pluginItem.amount,
                body: pluginItem.description,
            }
            let askCreateInvoiceUrl = `${this.app.config.doracms_api}/api/alipaySystem/createInvoice`
            let createInvoiceResult = await ctx.helper.reqJsonData(askCreateInvoiceUrl, invoiceData, 'post');

            ctx.helper.renderSuccess(ctx, {
                data: createInvoiceResult
            });

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    async checkInvoice() {

        const {
            ctx,
            service
        } = this;

        try {


            let noInvoice = ctx.request.body.noInvoice;

            if (!noInvoice) {
                throw new Error(ctx.__('validate_error_params'));
            }

            let checkInviceState = await this.ctx.helper.reqJsonData(this.app.config.doracms_api + '/api/alipaySystem/checkInvoice', {
                noInvoice
            }, 'post');

            ctx.helper.renderSuccess(ctx, {
                data: checkInviceState
            });

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

    // 心跳监测
    async pluginHeartBeat() {

        const {
            ctx,
        } = this;
        try {

            ctx.helper.renderSuccess(ctx, {
                data: 'success'
            });

        } catch (err) {
            ctx.helper.renderFail(ctx, {
                message: err
            });
        }
    }

}

module.exports = PluginController;