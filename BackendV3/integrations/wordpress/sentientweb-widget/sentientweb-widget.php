<?php
/**
 * Plugin Name: SentientWeb Widget
 * Description: Connect your WordPress site to SentientWeb and inject the backend-owned website agent.
 * Version: 0.1.0
 * Author: SentientWeb
 */

if (!defined('ABSPATH')) {
	exit;
}

define('SENTIENTWEB_WIDGET_VERSION', '0.1.0');
define('SENTIENTWEB_WIDGET_OPTION', 'sentientweb_widget_settings');
define('SENTIENTWEB_WIDGET_PAGE_SLUG', 'sentientweb');
define('SENTIENTWEB_WIDGET_HEARTBEAT_INTERVAL', 6 * HOUR_IN_SECONDS);

function sentientweb_widget_defaults() {
	return array(
		'backend_origin'    => '',
		'agent_script_url'  => '',
		'install_key'       => '',
		'management_token'  => '',
		'connected_origin'  => '',
		'last_heartbeat_at' => 0,
	);
}

function sentientweb_widget_get_settings() {
	$settings = get_option(SENTIENTWEB_WIDGET_OPTION, array());
	if (!is_array($settings)) {
		$settings = array();
	}

	return wp_parse_args($settings, sentientweb_widget_defaults());
}

function sentientweb_widget_save_settings($settings) {
	update_option(SENTIENTWEB_WIDGET_OPTION, $settings, false);
}

function sentientweb_widget_page_url($args = array()) {
	return add_query_arg($args, admin_url('admin.php?page=' . SENTIENTWEB_WIDGET_PAGE_SLUG));
}

function sentientweb_widget_site_origin() {
	return untrailingslashit(home_url());
}

function sentientweb_widget_normalize_backend_origin($value) {
	$normalized = esc_url_raw(trim((string) $value));
	if (!$normalized) {
		return '';
	}

	return untrailingslashit($normalized);
}

function sentientweb_widget_set_notice($message, $type = 'success') {
	set_transient(
		'sentientweb_widget_notice_' . get_current_user_id(),
		array(
			'message' => (string) $message,
			'type'    => (string) $type,
		),
		MINUTE_IN_SECONDS
	);
}

function sentientweb_widget_take_notice() {
	$key = 'sentientweb_widget_notice_' . get_current_user_id();
	$notice = get_transient($key);
	if ($notice) {
		delete_transient($key);
	}

	return is_array($notice) ? $notice : null;
}

function sentientweb_widget_extract_error_message($response, $fallback) {
	if (is_wp_error($response)) {
		return $response->get_error_message();
	}

	if (!is_array($response) || !isset($response['body']) || !is_array($response['body'])) {
		return $fallback;
	}

	$body = $response['body'];
	if (!empty($body['error']) && is_string($body['error'])) {
		return $body['error'];
	}

	return $fallback;
}

function sentientweb_widget_post_json($url, $payload) {
	$response = wp_remote_post(
		$url,
		array(
			'timeout' => 15,
			'headers' => array(
				'Content-Type' => 'application/json',
			),
			'body'    => wp_json_encode($payload),
		)
	);

	if (is_wp_error($response)) {
		return $response;
	}

	$raw_body = wp_remote_retrieve_body($response);
	$decoded_body = json_decode($raw_body, true);

	return array(
		'status' => (int) wp_remote_retrieve_response_code($response),
		'body'   => is_array($decoded_body) ? $decoded_body : array(),
	);
}

function sentientweb_widget_clear_connection($settings) {
	$settings['agent_script_url'] = '';
	$settings['install_key'] = '';
	$settings['management_token'] = '';
	$settings['connected_origin'] = '';
	$settings['last_heartbeat_at'] = 0;

	return $settings;
}

function sentientweb_widget_handle_exchange_return() {
	if (!is_admin() || !current_user_can('manage_options')) {
		return;
	}

	if (!isset($_GET['page']) || SENTIENTWEB_WIDGET_PAGE_SLUG !== $_GET['page']) {
		return;
	}

	if (empty($_GET['sentient_link_code']) || empty($_GET['sentient_backend_url'])) {
		return;
	}

	$backend_origin = sentientweb_widget_normalize_backend_origin(wp_unslash($_GET['sentient_backend_url']));
	$link_code = sanitize_text_field(wp_unslash($_GET['sentient_link_code']));
	$settings = sentientweb_widget_get_settings();

	if (!$backend_origin || !$link_code) {
		sentientweb_widget_set_notice('SentientWeb connect response was missing required parameters.', 'error');
		wp_safe_redirect(sentientweb_widget_page_url());
		exit;
	}

	$response = sentientweb_widget_post_json(
		$backend_origin . '/api/wordpress/exchange',
		array(
			'code'          => $link_code,
			'origin'        => sentientweb_widget_site_origin(),
			'pluginVersion' => SENTIENTWEB_WIDGET_VERSION,
		)
	);

	if (is_wp_error($response) || $response['status'] >= 400) {
		sentientweb_widget_set_notice(
			sentientweb_widget_extract_error_message($response, 'SentientWeb exchange failed.'),
			'error'
		);
		wp_safe_redirect(sentientweb_widget_page_url());
		exit;
	}

	$body = $response['body'];
	if (empty($body['installKey']) || empty($body['managementToken']) || empty($body['agentScriptUrl'])) {
		sentientweb_widget_set_notice('SentientWeb exchange response was incomplete.', 'error');
		wp_safe_redirect(sentientweb_widget_page_url());
		exit;
	}

	$settings['backend_origin'] = $backend_origin;
	$settings['agent_script_url'] = esc_url_raw($body['agentScriptUrl']);
	$settings['install_key'] = sanitize_text_field($body['installKey']);
	$settings['management_token'] = sanitize_text_field($body['managementToken']);
	$settings['connected_origin'] = sentientweb_widget_site_origin();
	$settings['last_heartbeat_at'] = time();
	sentientweb_widget_save_settings($settings);

	sentientweb_widget_set_notice('SentientWeb is now connected to this WordPress site.');
	wp_safe_redirect(sentientweb_widget_page_url());
	exit;
}

add_action('admin_init', 'sentientweb_widget_handle_exchange_return');

function sentientweb_widget_handle_admin_post() {
	if (!current_user_can('manage_options')) {
		wp_die('You do not have permission to manage SentientWeb.');
	}

	$intent = isset($_POST['sentientweb_widget_intent'])
		? sanitize_text_field(wp_unslash($_POST['sentientweb_widget_intent']))
		: '';
	$settings = sentientweb_widget_get_settings();

	if ('save_backend_origin' === $intent) {
		check_admin_referer('sentientweb_widget_save_backend_origin');
		$backend_origin = sentientweb_widget_normalize_backend_origin(
			isset($_POST['backend_origin']) ? wp_unslash($_POST['backend_origin']) : ''
		);

		if (!$backend_origin) {
			sentientweb_widget_set_notice('Enter a valid SentientWeb backend origin first.', 'error');
			wp_safe_redirect(sentientweb_widget_page_url());
			exit;
		}

		$settings['backend_origin'] = $backend_origin;
		sentientweb_widget_save_settings($settings);
		sentientweb_widget_set_notice('Saved SentientWeb backend origin.');
		wp_safe_redirect(sentientweb_widget_page_url());
		exit;
	}

	if ('connect' === $intent) {
		check_admin_referer('sentientweb_widget_connect');
		$backend_origin = sentientweb_widget_normalize_backend_origin(
			isset($_POST['backend_origin']) ? wp_unslash($_POST['backend_origin']) : $settings['backend_origin']
		);

		if (!$backend_origin) {
			sentientweb_widget_set_notice('Set the SentientWeb backend origin before connecting.', 'error');
			wp_safe_redirect(sentientweb_widget_page_url());
			exit;
		}

		$settings['backend_origin'] = $backend_origin;
		sentientweb_widget_save_settings($settings);

		$response = sentientweb_widget_post_json(
			$backend_origin . '/api/wordpress/connect',
			array(
				'origin'        => sentientweb_widget_site_origin(),
				'returnUrl'     => sentientweb_widget_page_url(),
				'pluginVersion' => SENTIENTWEB_WIDGET_VERSION,
			)
		);

		if (is_wp_error($response) || $response['status'] >= 400 || empty($response['body']['connectUrl'])) {
			sentientweb_widget_set_notice(
				sentientweb_widget_extract_error_message($response, 'Unable to create SentientWeb connect URL.'),
				'error'
			);
			wp_safe_redirect(sentientweb_widget_page_url());
			exit;
		}

		wp_redirect(esc_url_raw($response['body']['connectUrl']));
		exit;
	}

	if ('disconnect' === $intent) {
		check_admin_referer('sentientweb_widget_disconnect');

		if (empty($settings['backend_origin']) || empty($settings['install_key']) || empty($settings['management_token'])) {
			$settings = sentientweb_widget_clear_connection($settings);
			sentientweb_widget_save_settings($settings);
			sentientweb_widget_set_notice('Cleared local SentientWeb connection state.');
			wp_safe_redirect(sentientweb_widget_page_url());
			exit;
		}

		$response = sentientweb_widget_post_json(
			$settings['backend_origin'] . '/api/wordpress/disconnect',
			array(
				'installKey'      => $settings['install_key'],
				'managementToken' => $settings['management_token'],
			)
		);

		if (is_wp_error($response) || $response['status'] >= 400) {
			sentientweb_widget_set_notice(
				sentientweb_widget_extract_error_message($response, 'Unable to disconnect SentientWeb.'),
				'error'
			);
			wp_safe_redirect(sentientweb_widget_page_url());
			exit;
		}

		$settings = sentientweb_widget_clear_connection($settings);
		sentientweb_widget_save_settings($settings);
		sentientweb_widget_set_notice('Disconnected SentientWeb from this WordPress site.');
		wp_safe_redirect(sentientweb_widget_page_url());
		exit;
	}

	wp_safe_redirect(sentientweb_widget_page_url());
	exit;
}

add_action('admin_post_sentientweb_widget_action', 'sentientweb_widget_handle_admin_post');

function sentientweb_widget_maybe_send_heartbeat() {
	if (!is_admin() || !current_user_can('manage_options')) {
		return;
	}

	$settings = sentientweb_widget_get_settings();
	if (empty($settings['backend_origin']) || empty($settings['install_key']) || empty($settings['management_token'])) {
		return;
	}

	if ((int) $settings['last_heartbeat_at'] > time() - SENTIENTWEB_WIDGET_HEARTBEAT_INTERVAL) {
		return;
	}

	$response = sentientweb_widget_post_json(
		$settings['backend_origin'] . '/api/wordpress/heartbeat',
		array(
			'installKey'      => $settings['install_key'],
			'managementToken' => $settings['management_token'],
			'pluginVersion'   => SENTIENTWEB_WIDGET_VERSION,
		)
	);

	if (is_wp_error($response) || $response['status'] >= 400) {
		return;
	}

	$settings['last_heartbeat_at'] = time();
	sentientweb_widget_save_settings($settings);
}

add_action('admin_init', 'sentientweb_widget_maybe_send_heartbeat', 20);

function sentientweb_widget_add_admin_page() {
	add_menu_page(
		'SentientWeb',
		'SentientWeb',
		'manage_options',
		SENTIENTWEB_WIDGET_PAGE_SLUG,
		'sentientweb_widget_render_admin_page',
		'dashicons-format-chat',
		58
	);
}

add_action('admin_menu', 'sentientweb_widget_add_admin_page');

function sentientweb_widget_render_admin_page() {
	$settings = sentientweb_widget_get_settings();
	$notice = sentientweb_widget_take_notice();
	$is_connected = !empty($settings['agent_script_url']) && !empty($settings['install_key']);
	?>
	<div class="wrap">
		<h1>SentientWeb Widget</h1>
		<?php if ($notice) : ?>
			<div class="notice notice-<?php echo 'error' === $notice['type'] ? 'error' : 'success'; ?> is-dismissible">
				<p><?php echo esc_html($notice['message']); ?></p>
			</div>
		<?php endif; ?>

		<p>Connect this WordPress site to the SentientWeb backend and inject the backend-owned widget on every public page.</p>

		<table class="form-table" role="presentation">
			<tbody>
				<tr>
					<th scope="row">Site origin</th>
					<td><code><?php echo esc_html(sentientweb_widget_site_origin()); ?></code></td>
				</tr>
				<tr>
					<th scope="row">Status</th>
					<td><?php echo $is_connected ? 'Connected' : 'Not connected'; ?></td>
				</tr>
				<?php if ($is_connected) : ?>
					<tr>
						<th scope="row">Install key</th>
						<td><code><?php echo esc_html($settings['install_key']); ?></code></td>
					</tr>
					<tr>
						<th scope="row">Backend origin</th>
						<td><code><?php echo esc_html($settings['backend_origin']); ?></code></td>
					</tr>
				<?php endif; ?>
			</tbody>
		</table>

		<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
			<input type="hidden" name="action" value="sentientweb_widget_action" />
			<input type="hidden" name="sentientweb_widget_intent" value="save_backend_origin" />
			<?php wp_nonce_field('sentientweb_widget_save_backend_origin'); ?>
			<table class="form-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row"><label for="sentientweb-backend-origin">SentientWeb backend origin</label></th>
						<td>
							<input
								id="sentientweb-backend-origin"
								name="backend_origin"
								type="url"
								class="regular-text"
								placeholder="https://backend.example.com"
								value="<?php echo esc_attr($settings['backend_origin']); ?>"
								required
							/>
							<p class="description">Use the origin that serves <code>/agent.js</code> and the WordPress install APIs.</p>
						</td>
					</tr>
				</tbody>
			</table>
			<p class="submit">
				<button type="submit" class="button button-secondary">Save backend origin</button>
			</p>
		</form>

		<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
			<input type="hidden" name="action" value="sentientweb_widget_action" />
			<input type="hidden" name="sentientweb_widget_intent" value="connect" />
			<input type="hidden" name="backend_origin" value="<?php echo esc_attr($settings['backend_origin']); ?>" />
			<?php wp_nonce_field('sentientweb_widget_connect'); ?>
			<p class="submit">
				<button type="submit" class="button button-primary">Connect to SentientWeb</button>
			</p>
		</form>

		<?php if ($is_connected) : ?>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
				<input type="hidden" name="action" value="sentientweb_widget_action" />
				<input type="hidden" name="sentientweb_widget_intent" value="disconnect" />
				<?php wp_nonce_field('sentientweb_widget_disconnect'); ?>
				<p class="submit">
					<button type="submit" class="button button-link-delete">Disconnect</button>
				</p>
			</form>
		<?php endif; ?>
	</div>
	<?php
}

function sentientweb_widget_render_embed() {
	if (is_admin()) {
		return;
	}

	$settings = sentientweb_widget_get_settings();
	if (empty($settings['agent_script_url']) || empty($settings['install_key'])) {
		return;
	}

	printf(
		'<script src="%1$s" data-install-key="%2$s" async></script>',
		esc_url($settings['agent_script_url']),
		esc_attr($settings['install_key'])
	);
}

add_action('wp_footer', 'sentientweb_widget_render_embed', 20);
